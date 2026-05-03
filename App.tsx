import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Alert, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreenExpo from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { StripeProvider } from '@stripe/stripe-react-native';

import { RootNavigator } from './src/navigation/RootNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { COLORS } from './src/theme/theme';
import { useAppStore } from './src/store/useAppStore';
import { apiClient, setSessionExpiredHandler } from './src/services/api/client';
import { pushNotificationService, setupPushTokenRefresh } from './src/services/notifications/pushNotificationService';
import { notificationsApi } from './src/services/api';
import { useSocket } from './src/hooks/useSocket';

const stripePublishableKey =
  (Constants.expoConfig?.extra as any)?.stripePublishableKey ?? '';

SplashScreenExpo.preventAutoHideAsync();

// Global navigation ref so session-expiry handler can navigate without prop drilling
export const navigationRef = React.createRef<NavigationContainerRef<any>>();

function App(): React.JSX.Element {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const { setCurrentUser, setAuthenticated, logout, isAuthenticated,
    setUnreadNotificationCount, incrementUnreadNotificationCount } = useAppStore();
  const { socket } = useSocket({ autoConnect: isAuthenticated });

  // Idempotency guard — don't show the "session expired" alert twice
  const alertShownRef = useRef(false);

  // FIX 5: Register the session-expired handler once on mount
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (alertShownRef.current) return;
      alertShownRef.current = true;

      // 1. Clear auth state
      logout();

      // 2. Tell the user
      Alert.alert(
        'Session Expired',
        'Your session has expired. Please log in again.',
        [{
          text: 'OK',
          onPress: () => { alertShownRef.current = false; },
        }]
      );

      // 3. Navigate to login
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Auth' as never }] });
    });
  }, [logout]);

  // Session restoration on app startup
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const accessToken = await SecureStore.getItemAsync('bridger_access_token');

        if (accessToken) {
          const response = await apiClient.get<any>('/users/me', true);

          if (response.success && response.data) {
            setCurrentUser(response.data);
            setAuthenticated(true);
          } else {
            await SecureStore.deleteItemAsync('bridger_access_token');
            await SecureStore.deleteItemAsync('bridger_refresh_token');
            logout();
          }
        }
      } catch (error) {
        console.log('Session restoration failed:', error);
        try {
          await SecureStore.deleteItemAsync('bridger_access_token');
          await SecureStore.deleteItemAsync('bridger_refresh_token');
        } catch {}
        logout();
      } finally {
        setIsRestoringSession(false);
      }
    };

    restoreSession();
  }, []);

  // FIX 9: Set up push token refresh when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const cleanup = setupPushTokenRefresh();
    return cleanup;
  }, [isAuthenticated]);

  // Wire up notification tap navigation
  useEffect(() => {
    if (!isAuthenticated) return;
    const subs = pushNotificationService.addListeners({
      onNotificationResponseReceived: (response) => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        const nav = pushNotificationService.handleNotificationTap(data);
        if (nav) {
          (navigationRef.current as any)?.navigate(nav.screen, nav.params);
        }
      },
      onNotificationReceived: () => {
        // App is foregrounded — bump unread badge
        incrementUnreadNotificationCount();
      },
    });
    return () => pushNotificationService.removeListeners(subs);
  }, [isAuthenticated, incrementUnreadNotificationCount]);

  // Fetch unread notification count on login and when app comes to foreground
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchUnreadCount = async () => {
      try {
        const response = await notificationsApi.getHistory({ page: 1, limit: 50 });
        if (response.success && response.data) {
          const items = response.data.items || [];
          const unread = items.filter((n: any) => !n.read).length;
          setUnreadNotificationCount(unread);
        }
      } catch {
        // non-critical
      }
    };

    fetchUnreadCount();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchUnreadCount();
    });
    return () => sub.remove();
  }, [isAuthenticated, setUnreadNotificationCount]);

  // Socket-driven local notifications for new messages
  useEffect(() => {
    if (!socket || !isAuthenticated) return;

    const handleNewMessage = (message: any) => {
      // Only fire a banner if the sender is not the current user
      if (message?.senderId && message.senderId === useAppStore.getState().currentUser?.id) return;

      const senderName = message?.senderName || 'New message';
      pushNotificationService.sendNotification({
        title: senderName,
        body: message?.content || 'You have a new message',
        data: {
          type: 'new_message',
          conversationId: message?.roomId || message?.conversationId,
          senderId: message?.senderId,
        },
      });
      incrementUnreadNotificationCount();
    };

    socket.on('new_message', handleNewMessage);
    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, isAuthenticated, incrementUnreadNotificationCount]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreenExpo.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded || isRestoringSession) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <StripeProvider publishableKey={stripePublishableKey}>
        <SafeAreaProvider>
          <NavigationContainer ref={navigationRef}>
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </StripeProvider>
    </ErrorBoundary>
  );
}

export default App;
