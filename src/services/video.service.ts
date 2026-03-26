import prisma from "../config/database";
import { formatCount, computeMomentumScore } from "../lib/formatters";

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

  // Get all videos first to compute momentum baseline
  const allVideos = await prisma.video.findMany({
    where: { userId },
    select: { latestViews: true, postedAt: true },
  });
  const now = Date.now();
  const velocities = allVideos
    .filter((v) => v.postedAt)
    .map((v) => Number(v.latestViews) / Math.max(1, (now - v.postedAt!.getTime()) / 3600000));
  const baseline = velocities.length > 0
    ? velocities.reduce((a, b) => a + b, 0) / velocities.length
    : 1;

  const orderBy: any = {};
  if (sortBy === "views") orderBy.latestViews = sortDir;
  else if (sortBy === "engagement") orderBy.latestEngagementRate = sortDir;
  else orderBy.postedAt = sortDir;

  const [total, videos] = await Promise.all([
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
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
      },
    }),
  ]);

  const mapped = videos.map((v) => {
    const hoursAlive = v.postedAt ? Math.max(1, (now - v.postedAt.getTime()) / 3600000) : 1;
    const vph = Number(v.latestViews) / hoursAlive;
    const momentum = computeMomentumScore(vph, baseline);

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
      momentumScore: momentum,
    };
  });

  // Apply tab filtering after momentum calculation
  let filtered = mapped;
  if (tab === "high_momentum") {
    filtered = mapped.filter((v) => v.momentumScore >= 75);
  } else if (tab === "needs_attention") {
    filtered = mapped.filter((v) => v.momentumScore < 40);
  }

  return {
    videos: filtered,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
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
