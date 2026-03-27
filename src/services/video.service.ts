import prisma from "../config/database";
import { formatCount, computeMomentumScore } from "../lib/formatters";
import { getMomentumBaseline } from "../lib/momentumCache";

interface VideoFilters {
  userId: string;
  formatTag?: string;
  search?: string;
  tab?: "all" | "high_momentum" | "needs_attention";
  page?: number;
  limit?: number;
  sortBy?: "posted_at" | "views" | "engagement";
  sortDir?: "asc" | "desc";
}

export async function getVideos(filters: VideoFilters) {
  const {
    userId,
    formatTag,
    search,
    tab = "all",
    page = 1,
    limit = 20,
    sortBy = "posted_at",
    sortDir = "desc",
  } = filters;

  const where: any = { userId };

  if (formatTag) where.formatTag = formatTag;
  if (search) {
    where.OR = [
      { caption: { contains: search, mode: "insensitive" } },
      { hashtags: { has: search } },
    ];
  }

  // Use cached baseline instead of loading all videos every request
  const baseline = await getMomentumBaseline(userId);
  const now = Date.now();

  const orderBy: any = {};
  if (sortBy === "views") orderBy.latestViews = sortDir;
  else if (sortBy === "engagement") orderBy.latestEngagementRate = sortDir;
  else orderBy.postedAt = sortDir;

  if (tab === "all") {
    // Standard pagination — no post-filtering needed
    const [total, videos] = await Promise.all([
      prisma.video.count({ where }),
      prisma.video.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: videoSelect,
      }),
    ]);

    return {
      videos: videos.map((v) => mapVideo(v, now, baseline)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // For momentum-based tabs, we need to compute momentum before filtering.
  // Fetch a larger batch, compute momentum, filter, then slice for pagination.
  // This is correct because momentum isn't a DB column — it's computed at read time.
  const allMatchingVideos = await prisma.video.findMany({
    where,
    orderBy,
    select: videoSelect,
  });

  const mapped = allMatchingVideos.map((v) => mapVideo(v, now, baseline));

  const filtered =
    tab === "high_momentum"
      ? mapped.filter((v) => v.momentumScore >= 75)
      : mapped.filter((v) => v.momentumScore < 40);

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * limit, page * limit);

  return {
    videos: paged,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getVideoById(userId: string, videoId: string) {
  const video = await prisma.video.findFirst({
    where: { id: videoId, userId },
    include: {
      metricsSnapshots: {
        orderBy: { capturedAt: "desc" },
        take: 30,
      },
      comments: {
        orderBy: { postedAt: "desc" },
        take: 50,
      },
    },
  });

  if (!video) return null;
  return video;
}

// --- Helpers ---

const videoSelect = {
  id: true,
  caption: true,
  thumbnailUrl: true,
  formatTag: true,
  postedAt: true,
  durationSeconds: true,
  lengthBucket: true,
  hashtags: true,
  latestViews: true,
  latestLikes: true,
  latestComments: true,
  latestShares: true,
  latestSaves: true,
  latestEngagementRate: true,
} as const;

type VideoRow = Awaited<
  ReturnType<typeof prisma.video.findMany<{ select: typeof videoSelect }>>
>[number];

function mapVideo(v: VideoRow, now: number, baseline: number) {
  const hoursAlive = v.postedAt ? Math.max(1, (now - v.postedAt.getTime()) / 3600000) : 1;
  const vph = Number(v.latestViews) / hoursAlive;

  return {
    id: v.id,
    thumbnailUrl: v.thumbnailUrl,
    caption: v.caption,
    formatTag: v.formatTag,
    postedAt: v.postedAt,
    durationSeconds: v.durationSeconds ? Number(v.durationSeconds) : null,
    lengthBucket: v.lengthBucket,
    hashtags: v.hashtags,
    views: formatCount(v.latestViews),
    likes: formatCount(v.latestLikes),
    comments: formatCount(v.latestComments),
    shares: formatCount(v.latestShares),
    saves: formatCount(v.latestSaves),
    engagementScore: Math.round(Number(v.latestEngagementRate) * 1000) / 10,
    momentumScore: computeMomentumScore(vph, baseline),
  };
}
