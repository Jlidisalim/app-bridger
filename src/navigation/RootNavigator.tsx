import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAppStore } from '../store/useAppStore';
import { AuthStack } from './AuthStack';
import { AppStack } from './AppStack';
// FIX 20: Global offline banner shown on every screen
import { OfflineBanner } from '../components/OfflineBanner';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  return (
    <View style={{ flex: 1 }}>
      {/* FIX 20: OfflineBanner appears on top of all screens automatically */}
      <OfflineBanner />
      <Stack.Navigator
        id="RootStack"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        {isAuthenticated ? (
          <Stack.Screen name="App" component={AppStack} />
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </View>
  );
};
