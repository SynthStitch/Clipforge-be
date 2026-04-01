import { Request, Response, NextFunction } from "express";
import { cacheIncrement } from "../lib/cache";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * Shared-cache-backed rate limiter with in-memory fallback.
 */
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, message = "Too many requests, please try again later" } = options;
  const ttlSeconds = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const count = await cacheIncrement(`rate-limit:${key}:${windowMs}:${max}`, ttlSeconds);
    const resetAt = now + windowMs;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000));

    if (count > max) {
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
