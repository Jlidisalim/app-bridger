// FIX 22: Shared Redis client for distributed rate limiting and caching
import Redis from 'ioredis';
import logger from '../utils/logger';

let _redis: Redis | null = null;
let _isAvailable = !!process.env.REDIS_URL; // Don't even try if no URL configured
let _connectAttempted = false;

export function getRedis(): Redis | null {
  if (_redis) return _redis;
  if (!_isAvailable) return null;

  // Only attempt connection once — if it fails, stay in fallback mode
  if (_connectAttempted) return null;
  _connectAttempted = true;

  try {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,  // 1s instead of 3s — fail fast
      enableOfflineQueue: false,
      retryStrategy: () => null, // Don't auto-retry — use in-memory fallback instead
    });

    _redis.on('error', (err) => {
      if (_isAvailable) {
        logger.warn('Redis unavailable — using in-memory fallback', { error: err.message });
      }
      _isAvailable = false;
      _redis?.disconnect();
      _redis = null;
    });

    _redis.on('connect', () => {
      _isAvailable = true;
      logger.info('Redis connected');
    });
  } catch (err: any) {
    logger.warn('Redis unavailable — OTP rate limiting will use in-memory fallback', { error: err.message });
    _isAvailable = false;
  }

  return _redis;
}

export const redis = {
  async incr(key: string): Promise<number> {
    const client = getRedis();
    if (!client) return 1; // fallback: always allow (degraded mode)
    return client.incr(key);
  },

  async expire(key: string, seconds: number): Promise<void> {
    const client = getRedis();
    if (!client) return;
    await client.expire(key, seconds);
  },

  async ttl(key: string): Promise<number> {
    const client = getRedis();
    if (!client) return 60;
    return client.ttl(key);
  },

  async del(key: string): Promise<void> {
    const client = getRedis();
    if (!client) return;
    await client.del(key);
  },

  async get(key: string): Promise<string | null> {
    const client = getRedis();
    if (!client) return null;
    return client.get(key);
  },

  async setex(key: string, seconds: number, value: string): Promise<void> {
    const client = getRedis();
    if (!client) return;
    await client.setex(key, seconds, value);
  },
};
