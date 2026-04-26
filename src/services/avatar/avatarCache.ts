/**
 * AvatarCacheService
 *
 * Centralises avatar URL management across the app. Responsibilities:
 *   - HTTPS enforcement: rejects plain-HTTP or data-less URLs before any fetch
 *   - Native cache warm-up: calls Image.prefetch() so subsequent <Image> renders
 *     hit the on-device cache with zero extra network trips
 *   - In-memory index: O(1) sync look-up of userId → current URL
 *   - AsyncStorage persistence: survives app restarts; entries are re-prefetched
 *     on boot if older than REFRESH_AFTER_MS
 *   - Subscriber pattern: components subscribe by userId and are notified
 *     instantly when a contact changes their avatar (e.g. via socket event)
 *   - LRU-style eviction: keeps index under MAX_ENTRIES to bound memory usage
 */

import { Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Constants ────────────────────────────────────────────────────────────────
const STORE_KEY = 'bridger_avatar_index_v1';
const MAX_ENTRIES = 300;
/** Re-prefetch entries older than this on app restart */
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000; // 6 h

// ── Types ────────────────────────────────────────────────────────────────────
interface IndexEntry {
  url: string;
  registeredAt: number;
}

/** Callback signature for avatar update subscriptions */
export type AvatarListener = (url: string | null) => void;

// ── Service class ─────────────────────────────────────────────────────────────
class AvatarCacheService {
  /** Persisted userId → {url, timestamp} index */
  private index: Record<string, IndexEntry> = {};
  /** userId → set of active listener callbacks */
  private listeners = new Map<string, Set<AvatarListener>>();
  /** URLs currently being prefetched — deduplicate concurrent calls */
  private prefetching = new Set<string>();

  constructor() {
    this.loadIndex();
  }

  // ── Initialisation ──────────────────────────────────────────────────────────

  private async loadIndex(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) {
        this.index = JSON.parse(raw) as Record<string, IndexEntry>;
        const now = Date.now();
        for (const entry of Object.values(this.index)) {
          // Background-refresh stale entries so native cache stays warm
          if (now - entry.registeredAt > REFRESH_AFTER_MS) {
            this.prefetch(entry.url);
          }
        }
      }
    } catch {
      // Non-critical — proceed with empty index
    }
  }

  private async persistIndex(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORE_KEY, JSON.stringify(this.index));
    } catch {}
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Allow only HTTPS remote URLs and safe local URIs.
   * Blocks HTTP to prevent man-in-the-middle attacks on avatar images.
   */
  private isSafe(url: string): boolean {
    return (
      url.startsWith('https://') ||
      url.startsWith('file://') ||
      url.startsWith('data:image/')
    );
  }

  /** Evict oldest entries when the index grows beyond MAX_ENTRIES */
  private evictOldestIfNeeded(): void {
    const keys = Object.keys(this.index);
    if (keys.length <= MAX_ENTRIES) return;
    const overflow = keys.length - MAX_ENTRIES;
    const sorted = keys.sort(
      (a, b) => this.index[a].registeredAt - this.index[b].registeredAt,
    );
    sorted.slice(0, overflow).forEach((k) => delete this.index[k]);
  }

  private notifyListeners(userId: string, url: string | null): void {
    this.listeners.get(userId)?.forEach((cb) => {
      try {
        cb(url);
      } catch {}
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Pre-warm the native image cache for a URL.
   * Safe to call multiple times — deduplicates in-flight requests.
   */
  async prefetch(url: string): Promise<void> {
    if (!url || !this.isSafe(url) || this.prefetching.has(url)) return;
    this.prefetching.add(url);
    try {
      await Image.prefetch(url);
    } catch {
      // Network unavailable or URL invalid — not fatal
    } finally {
      this.prefetching.delete(url);
    }
  }

  /**
   * Register (or update) the avatar URL for a user.
   *
   * - Ignores non-HTTPS URLs
   * - Fires prefetch asynchronously
   * - Notifies subscribers only when the URL actually changes
   */
  async register(userId: string, url: string | null | undefined): Promise<void> {
    if (!userId) return;

    // Remove mapping if URL is absent or unsafe
    if (!url || !this.isSafe(url)) {
      if (this.index[userId]) {
        delete this.index[userId];
        this.persistIndex();
        this.notifyListeners(userId, null);
      }
      return;
    }

    const existing = this.index[userId];
    const urlChanged = !existing || existing.url !== url;

    this.index[userId] = { url, registeredAt: Date.now() };
    this.evictOldestIfNeeded();

    // Fire-and-forget prefetch — warms native cache without blocking
    this.prefetch(url);

    if (urlChanged) {
      this.persistIndex();
      this.notifyListeners(userId, url);
    }
  }

  /**
   * Synchronously return the current cached URL for a userId, or null.
   * Useful for initialising component state before subscriptions fire.
   */
  getUrl(userId: string): string | null {
    return this.index[userId]?.url ?? null;
  }

  /**
   * Subscribe to future avatar URL changes for a specific userId.
   *
   * @returns Unsubscribe function — call it in the component's cleanup effect.
   */
  subscribe(userId: string, listener: AvatarListener): () => void {
    if (!this.listeners.has(userId)) {
      this.listeners.set(userId, new Set());
    }
    this.listeners.get(userId)!.add(listener);
    return () => {
      this.listeners.get(userId)?.delete(listener);
    };
  }

  /**
   * Invalidate an avatar after an external update (e.g. socket `avatar_updated`
   * event). Re-registers the new URL and immediately notifies all subscribers
   * so every open chat window and list row refreshes without a manual reload.
   */
  async invalidate(userId: string, newUrl: string | null): Promise<void> {
    await this.register(userId, newUrl);
  }

  /**
   * Wipe all cached data.
   * Call this on logout so the next user starts with a clean slate.
   */
  clear(): void {
    this.index = {};
    this.listeners.clear();
    this.prefetching.clear();
    AsyncStorage.removeItem(STORE_KEY).catch(() => {});
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const avatarCache = new AvatarCacheService();
