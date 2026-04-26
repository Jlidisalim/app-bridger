import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainTabParamList, AppStackParamList } from './types';
import { useAppStore } from '../store/useAppStore';
import { COLORS, SPACING } from '../theme/theme';
import { Typography } from '../components/Typography';

// Screen imports
import { HomeScreen } from '../screens/HomeScreen';
import { ExploreScreen } from '../screens/ExploreScreen';
import { MessagesScreen } from '../screens/MessagesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { CreateSelectionScreen } from '../screens/CreateSelectionScreen';

// Icons
import {
  Home,
  Search,
  Plus,
  MessageSquare,
  User,
} from 'lucide-react-native';

const Tab = createBottomTabNavigator<MainTabParamList>();

// ============================================
// Tab Screen Wrappers
// ============================================

const HomeTabWrapper = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { mode, setMode, deals, currentUser } = useAppStore();

  // Find the first active deal the current user is involved in
  const firstActiveDeal = deals.find((d: any) =>
    ['MATCHED', 'PICKED_UP', 'IN_TRANSIT'].includes(d.status) &&
    (d.senderId === currentUser?.id || d.travelerId === currentUser?.id)
  );

  const handleViewMatch = () => {
    if (firstActiveDeal) {
      navigation.navigate('Tracking', { dealId: (firstActiveDeal as any).id });
    } else {
      navigation.navigate('CreateSelection');
    }
  };

  return (
    <HomeScreen
      mode={mode}
      onToggleMode={setMode}
      onHome={() => {}}
      onExplore={() => navigation.navigate('MainTabs', { screen: 'ExploreTab' })}
      onSendMessage={() => navigation.navigate('MainTabs', { screen: 'MessagesTab' })}
      onProfile={() => navigation.navigate('MainTabs', { screen: 'ProfileTab' })}
      onCreate={() => navigation.navigate('CreateSelection')}
      onChatWithUser={(user) => navigation.navigate('ChatDetail', { user: { ...user, dealId: (user as any).dealId } })}
      onViewDeal={(deal) => navigation.navigate('DealDetails', {
        dealId: deal.id,
        type: deal._type === 'trip' ? 'trip' : 'deal',
        isOwner: !!deal._type, // _type is only set on myPosts items
      })}
      onAcceptDeal={(deal) => navigation.navigate('Tracking', { dealId: deal.id })}
      onNotifications={() => navigation.navigate('Notifications')}
      onViewMatch={handleViewMatch}
    />
  );
};

const ExploreTabWrapper = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  return (
    <ExploreScreen
      onViewDetails={(deal) => navigation.navigate('DealDetails', { dealId: deal.id })}
      onChat={(user) => navigation.navigate('ChatDetail', { user })}
      onOpenTracking={(dealId) => navigation.navigate('LiveTracking', { dealId })}
      onSwitchTab={(tab) => {
        if (tab === 'home') navigation.navigate('MainTabs', { screen: 'HomeTab' });
        else if (tab === 'messages') navigation.navigate('MainTabs', { screen: 'MessagesTab' });
        else if (tab === 'profile') navigation.navigate('MainTabs', { screen: 'ProfileTab' });
        else if (tab === 'create') navigation.navigate('CreateSelection');
      }}
    />
  );
};

const CreateTabWrapper = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const setMode = useAppStore((s) => s.setMode);

  return (
    <CreateSelectionScreen
      onBack={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
      onSelectSender={() => {
        setMode('sender');
        navigation.navigate('PackageDetails');
      }}
      onSelectTraveler={() => {
        setMode('traveler');
        navigation.navigate('TravelerRoute');
      }}
    />
  );
};

const MessagesTabWrapper = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  return (
    <MessagesScreen
      onBack={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
      onHome={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
      onExplore={() => navigation.navigate('MainTabs', { screen: 'ExploreTab' })}
      onCreate={() => navigation.navigate('CreateSelection')}
      onMessages={() => {}}
      onProfile={() => navigation.navigate('MainTabs', { screen: 'ProfileTab' })}
      onSelectChat={(user) => navigation.navigate('ChatDetail', { user: { ...user, dealId: (user as any).dealId } })}
    />
  );
};

const ProfileTabWrapper = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  return (
    <ProfileScreen
      onHome={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
      onExplore={() => navigation.navigate('MainTabs', { screen: 'ExploreTab' })}
      onCreate={() => navigation.navigate('CreateSelection')}
      onMessages={() => navigation.navigate('MainTabs', { screen: 'MessagesTab' })}
      onProfile={() => {}}
      onWallet={() => navigation.navigate('Wallet')}
      onSettings={() => navigation.navigate('Settings')}
      onEditProfile={() => navigation.navigate('EditProfile')}
      onHelp={() => navigation.navigate('HelpSupport')}
      onNotifications={() => navigation.navigate('Notifications')}
    />
  );
};

// ============================================
// Main Tab Navigator
// ============================================
export const MainTabs = () => {
  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // We use custom tab bars in screens
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeTabWrapper} />
      <Tab.Screen name="ExploreTab" component={ExploreTabWrapper} />
      <Tab.Screen name="CreateTab" component={CreateTabWrapper} />
      <Tab.Screen name="MessagesTab" component={MessagesTabWrapper} />
      <Tab.Screen name="ProfileTab" component={ProfileTabWrapper} />
    </Tab.Navigator>
  );
};
