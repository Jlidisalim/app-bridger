// Empty State Component
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Typography } from './Typography';
import { Package, Search, MessageSquare, Bell, Wallet, User } from 'lucide-react-native';

type EmptyStateType = 'deals' | 'search' | 'messages' | 'notifications' | 'wallet' | 'profile';

interface EmptyStateProps {
  type: EmptyStateType;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const emptyStateConfig: Record<EmptyStateType, { icon: any; defaultTitle: string; defaultMessage: string }> = {
  deals: {
    icon: Package,
    defaultTitle: 'No deals yet',
    defaultMessage: 'Create your first deal to get started',
  },
  search: {
    icon: Search,
    defaultTitle: 'No results found',
    defaultMessage: 'Try adjusting your search or filters',
  },
  messages: {
    icon: MessageSquare,
    defaultTitle: 'No messages yet',
    defaultMessage: 'Start a conversation with other users',
  },
  notifications: {
    icon: Bell,
    defaultTitle: 'No notifications',
    defaultMessage: "You're all caught up!",
  },
  wallet: {
    icon: Wallet,
    defaultTitle: 'No transactions',
    defaultMessage: 'Your transaction history will appear here',
  },
  profile: {
    icon: User,
    defaultTitle: 'No profile data',
    defaultMessage: 'Complete your profile to get started',
  },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  title,
  message,
  actionLabel,
  onAction,
}) => {
  const config = emptyStateConfig[type];
  const Icon = config.icon;

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Icon size={48} color="#CCC" />
      </View>
      <Typography size="lg" weight="bold" style={styles.title}>
        {title || config.defaultTitle}
      </Typography>
      <Typography size="sm" color="#666" style={styles.message}>
        {message || config.defaultMessage}
      </Typography>
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.button} onPress={onAction}>
          <Typography size="sm" weight="semibold" color="#007AFF">
            {actionLabel}
          </Typography>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    marginTop: 8,
    textAlign: 'center',
  },
  message: {
    marginTop: 4,
    textAlign: 'center',
  },
  button: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
});
