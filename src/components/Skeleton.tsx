// Skeleton Loading Component
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as any,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E0E0E0',
  },
});

// Deal Card Skeleton
export const DealCardSkeleton: React.FC = () => (
  <View style={dealCardStyles.container}>
    <View style={dealCardStyles.header}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={dealCardStyles.headerText}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={12} style={{ marginTop: 4 }} />
      </View>
    </View>
    <View style={dealCardStyles.route}>
      <Skeleton width="45%" height={14} />
      <View style={dealCardStyles.arrow}>
        <Skeleton width={20} height={10} />
      </View>
      <Skeleton width="45%" height={14} />
    </View>
    <View style={dealCardStyles.footer}>
      <Skeleton width={80} height={24} borderRadius={12} />
      <Skeleton width={60} height={20} />
    </View>
  </View>
);

const dealCardStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  arrow: {
    flex: 1,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

// Wallet Skeleton
export const WalletSkeleton: React.FC = () => (
  <View style={walletStyles.container}>
    <Skeleton width="40%" height={32} />
    <Skeleton width="60%" height={48} style={{ marginTop: 8 }} />
    <View style={walletStyles.actions}>
      <Skeleton width={60} height={60} borderRadius={12} />
      <Skeleton width={60} height={60} borderRadius={12} />
      <Skeleton width={60} height={60} borderRadius={12} />
    </View>
  </View>
);

const walletStyles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 24,
  },
});
