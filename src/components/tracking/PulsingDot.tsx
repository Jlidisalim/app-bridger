// Animated GPS dot. Uses RN's built-in Animated API (no reanimated dep).
// Renders three concentric pulsing rings + a static centerpiece (avatar or solid dot).

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, ViewStyle } from 'react-native';

interface Props {
  size?:    number;
  color?:   string;
  avatar?:  string | null;
  pointerEventsNone?: boolean;
}

export const PulsingDot: React.FC<Props> = ({
  size = 14,
  color = '#22c55e',
  avatar = null,
  pointerEventsNone = true,
}) => {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 2000,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
    const animations = [make(a1, 0), make(a2, 400), make(a3, 800)];
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [a1, a2, a3]);

  const ring = (val: Animated.Value, maxScale: number, peakOpacity: number): ViewStyle => {
    const scale = val.interpolate({ inputRange: [0, 1], outputRange: [1, maxScale] });
    const opacity = val.interpolate({ inputRange: [0, 1], outputRange: [peakOpacity, 0] });
    return {
      position: 'absolute',
      width: size * 2.5,
      height: size * 2.5,
      borderRadius: size * 1.25,
      backgroundColor: color,
      transform: [{ scale } as any],
      opacity,
    } as any;
  };

  return (
    <View
      pointerEvents={pointerEventsNone ? 'none' : 'auto'}
      style={[styles.wrap, { width: size * 3, height: size * 3 }]}
    >
      <Animated.View style={ring(a1, 2.4, 0.35)} />
      <Animated.View style={ring(a2, 1.9, 0.5)} />
      <Animated.View style={ring(a3, 1.5, 0.6)} />
      {avatar ? (
        <Image
          source={{ uri: avatar }}
          style={{
            width: size * 1.6,
            height: size * 1.6,
            borderRadius: size * 0.8,
            borderWidth: 2,
            borderColor: '#fff',
          }}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            borderWidth: 2,
            borderColor: '#fff',
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
