import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Switch,
  Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme/theme';
import { Typography } from '../components/Typography';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Bell, Shield, Globe, Trash2, ChevronRight } from 'lucide-react-native';
import { userApi, notificationsApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { Linking } from 'react-native';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const logout = useAppStore(state => state.logout);
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [dealsNotifications, setDealsNotifications] = useState(true);
  const [messagesNotifications, setMessagesNotifications] = useState(true);
  const [paymentsNotifications, setPaymentsNotifications] = useState(true);

  const handleNotificationToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    try {
      await notificationsApi.updateSettings({
        deals: value && dealsNotifications,
        messages: value && messagesNotifications,
        payments: value && paymentsNotifications,
      });
    } catch (error) {
      console.error('Failed to update notification settings:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Logout', 
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch {}
          (navigation as any).reset({
            index: 0,
            routes: [{ name: 'Splash' }],
          });
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            // Call delete account API
            Alert.alert('Account Deletion', 'Please contact support to delete your account.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography size="lg" weight="bold">Settings</Typography>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Notifications Section */}
        <View style={styles.section}>
          <Typography size="sm" weight="bold" color="#666" style={styles.sectionTitle}>
            NOTIFICATIONS
          </Typography>
          
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Bell size={20} color={COLORS.primary} />
              <Typography size="md" style={{ marginLeft: 12 }}>Push Notifications</Typography>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: '#e0e0e0', true: COLORS.primary }}
            />
          </View>

          {notificationsEnabled && (
            <>
              <View style={styles.subSettingItem}>
                <Typography size="sm" style={{ marginLeft: 32 }}>Deal updates</Typography>
                <Switch
                  value={dealsNotifications}
                  onValueChange={setDealsNotifications}
                  trackColor={{ false: '#e0e0e0', true: COLORS.primary }}
                />
              </View>
              <View style={styles.subSettingItem}>
                <Typography size="sm" style={{ marginLeft: 32 }}>Messages</Typography>
                <Switch
                  value={messagesNotifications}
                  onValueChange={setMessagesNotifications}
                  trackColor={{ false: '#e0e0e0', true: COLORS.primary }}
                />
              </View>
              <View style={styles.subSettingItem}>
                <Typography size="sm" style={{ marginLeft: 32 }}>Payments</Typography>
                <Switch
                  value={paymentsNotifications}
                  onValueChange={setPaymentsNotifications}
                  trackColor={{ false: '#e0e0e0', true: COLORS.primary }}
                />
              </View>
            </>
          )}
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Typography size="sm" weight="bold" color="#666" style={styles.sectionTitle}>
            PRIVACY & SECURITY
          </Typography>
          
          <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://bridger.app/privacy')}>
            <View style={styles.settingLeft}>
              <Shield size={20} color={COLORS.primary} />
              <Typography size="md" style={{ marginLeft: 12 }}>Privacy Policy</Typography>
            </View>
            <ChevronRight size={20} color="#999" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://bridger.app/terms')}>
            <View style={styles.settingLeft}>
              <Globe size={20} color={COLORS.primary} />
              <Typography size="md" style={{ marginLeft: 12 }}>Terms of Service</Typography>
            </View>
            <ChevronRight size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Typography size="sm" weight="bold" color="#666" style={styles.sectionTitle}>
            ACCOUNT
          </Typography>
          
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={handleLogout}
          >
            <View style={styles.settingLeft}>
              <Typography size="md" weight="bold" color="#FF3B30">Logout</Typography>
            </View>
            <ChevronRight size={20} color="#999" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={handleDeleteAccount}
          >
            <View style={styles.settingLeft}>
              <Trash2 size={20} color="#FF3B30" />
              <Typography size="md" style={{ marginLeft: 12, color: '#FF3B30' }}>Delete Account</Typography>
            </View>
            <ChevronRight size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Version Info */}
        <View style={styles.versionContainer}>
          <Typography size="sm" color="#999">Version 1.0.0</Typography>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  content: {
    padding: SPACING.md,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subSettingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: SPACING.md,
    paddingLeft: SPACING.xl,
    marginBottom: 1,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
});

export default SettingsScreen;
