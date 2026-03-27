import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * Simple in-memory rate limiter. For production, swap for Redis-backed.
 * Keyed by IP address.
 */
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, message = "Too many requests, please try again later" } = options;
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup every windowMs
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}

/** Strict limiter for auth endpoints: 10 requests per 15 minutes */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many auth attempts, please try again in 15 minutes",
});

/** Standard limiter for sync/generate triggers: 5 per minute */
export const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many sync requests, please wait before retrying",
});

/** General API limiter: 100 requests per minute */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
});
