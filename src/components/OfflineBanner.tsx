// FIX 20: Global offline banner — displayed on every screen via root navigator
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Typography } from './Typography';

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  if (isConnected) return null;

  return (
    <View style={styles.banner}>
      <Typography size="sm" weight="bold" color="#fff" align="center">
        No internet connection
      </Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
