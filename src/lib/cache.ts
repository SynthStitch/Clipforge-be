import { env } from "../config/env";

interface CacheEntry {
  value: string;
  expiresAt?: number;
}

class MemoryCache {
  private readonly store = new Map<string, CacheEntry>();

  get(key: string) {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: string, ttlSeconds?: number) {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  delete(key: string) {
    this.store.delete(key);
  }

  increment(key: string, ttlSeconds: number) {
    const current = Number(this.get(key) ?? "0") + 1;
    this.set(key, String(current), ttlSeconds);
    return current;
  }
}

const memoryCache = new MemoryCache();
const redisConfigured = Boolean(env.redisRestUrl && env.redisRestToken);

async function redisCommand<T>(...args: Array<string | number>): Promise<T> {
  const response = await fetch(env.redisRestUrl!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.redisRestToken!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    throw new Error(`Redis request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: T; error?: string };
  if (payload.error) {
    throw new Error(payload.error);
  }

  return payload.result as T;
}

export async function cacheGet(key: string) {
  if (!redisConfigured) {
    return memoryCache.get(key);
  }

  try {
    return await redisCommand<string | null>("GET", key);
  } catch {
    return memoryCache.get(key);
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number) {
  if (!redisConfigured) {
    memoryCache.set(key, value, ttlSeconds);
    return;
  }

  try {
    if (ttlSeconds) {
      await redisCommand("SETEX", key, ttlSeconds, value);
      return;
    }

    await redisCommand("SET", key, value);
  } catch {
    memoryCache.set(key, value, ttlSeconds);
  }
}

export async function cacheDelete(key: string) {
  if (!redisConfigured) {
    memoryCache.delete(key);
    return;
  }

  try {
    await redisCommand("DEL", key);
  } catch {
    memoryCache.delete(key);
  }
}

export async function cacheIncrement(key: string, ttlSeconds: number) {
  if (!redisConfigured) {
    return memoryCache.increment(key, ttlSeconds);
  }

  try {
    const count = await redisCommand<number>("INCR", key);
    if (count === 1) {
      await redisCommand("EXPIRE", key, ttlSeconds);
    }
    return count;
  } catch {
    return memoryCache.increment(key, ttlSeconds);
  }
}
