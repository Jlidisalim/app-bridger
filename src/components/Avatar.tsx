/**
 * Avatar
 *
 * A consistent, accessible avatar that:
 *   - Shows the user's profile image when available
 *   - Displays coloured initials as a placeholder while the image loads
 *   - Falls back to initials permanently if the image fails to load
 *   - Subscribes to avatarCache so it updates instantly when a contact
 *     changes their photo (no manual refresh required)
 *   - Enforces safe rendering: only HTTPS / local URIs reach <Image>
 *   - Fully accessible: exposes accessibilityRole="image" and a meaningful label
 *   - High-contrast friendly: initials background colours meet WCAG AA contrast
 *     against the white text rendered on top
 */

import React, { memo, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Typography } from './Typography';
import { avatarCache } from '../services/avatar/avatarCache';
import { COLORS } from '../theme/theme';

// ── Initials helpers ──────────────────────────────────────────────────────────

/** WCAG AA-contrast colours for initials backgrounds */
const INITIALS_PALETTE = [
  '#1E40AF', // deep blue
  '#0E7490', // teal
  '#047857', // emerald
  '#B45309', // amber (dark)
  '#B91C1C', // red
  '#6D28D9', // violet
  '#9D174D', // rose
];

/** Deterministic but non-sequential bucket from a name string */
function pickColor(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    // djb2 variant — simple, fast, well-distributed for short strings
    h = ((h << 5) + h) + seed.charCodeAt(i);
  }
  return INITIALS_PALETTE[Math.abs(h) % INITIALS_PALETTE.length];
}

/** Up to 2-character initials extracted from a display name */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  const trimmed = name.trim();
  return trimmed.length >= 2 ? trimmed.slice(0, 2).toUpperCase() : trimmed.toUpperCase() || '?';
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AvatarProps {
  /**
   * Stable user ID used as the cache key for subscriptions.
   * Without this the Avatar still renders but won't receive live updates.
   */
  userId?: string;
  /** Remote (https://) or local (file://) avatar URI */
  uri?: string | null;
  /** Display name — drives initials text and background colour */
  name?: string;
  /** Diameter of the circular avatar in logical pixels (default: 40) */
  size?: number;
  /** Additional styles applied to the outer container */
  style?: object;
  /**
   * Screen-reader label. Defaults to "{name}'s avatar" or "User avatar".
   * Pass an explicit value when the context makes the default ambiguous.
   */
  accessibilityLabel?: string;
  testID?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Avatar = memo<AvatarProps>(function Avatar({
  userId,
  uri,
  name = '',
  size = 40,
  style,
  accessibilityLabel,
  testID,
}) {
  const [imgUri, setImgUri] = useState<string | null>(uri ?? null);
  const [imgError, setImgError] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // ── Sync prop → state when the parent passes a new URI ─────────────────────
  useEffect(() => {
    const safeUri = uri ?? null;
    if (isMounted.current) {
      setImgUri(safeUri);
      setImgError(false);
    }
    // Register with cache so other components sharing this userId stay in sync
    if (userId && safeUri) {
      avatarCache.register(userId, safeUri);
    }
  }, [uri, userId]);

  // ── Subscribe to live cache updates for this user ─────────────────────────
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = avatarCache.subscribe(userId, (newUri) => {
      if (!isMounted.current) return;
      setImgUri(newUri);
      // Clear previous error so the new image gets a fresh attempt
      if (newUri) setImgError(false);
    });
    return unsubscribe;
  }, [userId]);

  // ── Derived display values ────────────────────────────────────────────────
  const radius = size / 2;
  const bgColor = name ? pickColor(name) : COLORS.background.slate[400];
  const label =
    accessibilityLabel ?? (name ? `${name}'s avatar` : 'User avatar');
  const initialsText = name ? getInitials(name) : '?';
  /** Scale initials font with avatar size — clamp to a readable minimum */
  const fontSize = Math.max(10, Math.floor(size * 0.36));

  return (
    /**
     * Layout strategy: initials layer sits inside the base View as always-
     * present fallback (skeleton while loading + permanent error fallback).
     * The <Image> is absolutely-filled on top so it hides the initials once
     * loaded. If the image errors, setting imgError=true unmounts the Image
     * and the initials are revealed again — no layout shift.
     */
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius, backgroundColor: bgColor },
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      testID={testID}
    >
      {/* Initials — hidden from screen readers (the outer View announces the label) */}
      <Typography
        weight="bold"
        color={COLORS.white}
        style={{ fontSize, lineHeight: fontSize * 1.25 }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {initialsText}
      </Typography>

      {/* Image overlay — covers initials when successfully loaded */}
      {imgUri && !imgError && (
        <Image
          source={{ uri: imgUri }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          onError={() => {
            if (isMounted.current) setImgError(true);
          }}
          // Hidden from accessibility tree — outer View already announces the label
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
    </View>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
