import prisma from "../config/database";

interface CachedBaseline {
  baseline: number;
  computedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CachedBaseline>();

/**
 * Get the momentum baseline for a user — the average views-per-hour
 * across all their videos. Cached for 5 minutes to avoid loading
 * every video on every request.
 */
export async function getMomentumBaseline(userId: string): Promise<number> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.computedAt < CACHE_TTL_MS) {
    return cached.baseline;
  }

  const videos = await prisma.video.findMany({
    where: { userId },
    select: { latestViews: true, postedAt: true },
  });

  const now = Date.now();
  const velocities = videos
    .filter((v) => v.postedAt)
    .map((v) => Number(v.latestViews) / Math.max(1, (now - v.postedAt!.getTime()) / 3600000));

  const baseline = velocities.length > 0
    ? velocities.reduce((a, b) => a + b, 0) / velocities.length
    : 1;

  cache.set(userId, { baseline, computedAt: now });
  return baseline;
}

/** Invalidate cache for a user (call after sync completes) */
export function invalidateMomentumCache(userId: string) {
  cache.delete(userId);
}
