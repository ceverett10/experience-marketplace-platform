/**
 * Distributed Lock Service
 *
 * Uses Redis SET NX EX for distributed mutual exclusion.
 * Prevents multiple worker instances from running the same
 * autonomous process concurrently (e.g., roadmap processing).
 */

import IORedis from 'ioredis';
import { randomUUID } from 'crypto';

let redis: IORedis | null = null;

function getRedis(): IORedis {
  if (!redis) {
    const redisUrl =
      process.env['REDIS_URL'] || process.env['REDIS_TLS_URL'] || 'redis://localhost:6379';
    const usesTls = redisUrl.includes('rediss://');
    redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: usesTls ? { rejectUnauthorized: false } : undefined,
    });
  }
  return redis;
}

/**
 * Acquire a distributed lock.
 *
 * @param key - Lock key name (e.g., 'roadmap-processor')
 * @param ttlMs - Lock TTL in milliseconds. Must exceed the expected operation duration
 *                so the lock doesn't expire while the operation is still running.
 * @returns A release function if acquired, or null if another instance holds the lock.
 */
export async function acquireLock(
  key: string,
  ttlMs: number
): Promise<(() => Promise<void>) | null> {
  const lockKey = `lock:${key}`;
  const lockValue = randomUUID();
  const ttlSeconds = Math.ceil(ttlMs / 1000);

  const client = getRedis();

  // SET key value NX EX ttl — atomic acquire
  const result = await client.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');

  if (result !== 'OK') {
    return null; // Lock held by another instance
  }

  // Return a release function that only releases if we still hold the lock
  // Uses a Lua script for atomicity (check-and-delete)
  const releaseLua = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  return async () => {
    try {
      await client.eval(releaseLua, 1, lockKey, lockValue);
    } catch (err) {
      console.error(`[Lock] Failed to release lock ${key}:`, err);
    }
  };
}
