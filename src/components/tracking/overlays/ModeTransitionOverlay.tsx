import React from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  mode: 'gps' | 'flight' | 'walking' | 'car' | null;
  nonce: number;
  onDone: () => void;
}

export const ModeTransitionOverlay: React.FC<Props> = ({ mode, nonce, onDone }) => {
  // For now, we don't do anything. In the future, this could show an animation.
  // We call onDone immediately to avoid blocking.
  // Note: In a real app, you might want to wait for an animation to finish.
  // But for the purpose of resolving the import, we'll call it in useEffect.
  // However, to avoid infinite loop, we'll use nonce as a key and call onDone when mode changes.
  // But since we don't have an animation, we'll just call onDone immediately.
  // We'll use useEffect to call onDone when the component mounts or when mode changes.
  // However, the original code might rely on the overlay being present for a duration.
  // Let's instead not call onDone and let the parent handle it via the nonce.
  // The parent uses the nonce to know when to reset the overlay.
  // We'll just render nothing for now.
  return null;
};

const styles = StyleSheet.create({});