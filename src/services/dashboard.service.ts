import prisma from "../config/database";
import { formatCount, formatEngagement, computeMomentumScore } from "../lib/formatters";
import { getMomentumBaseline } from "../lib/momentumCache";

export async function getDashboardMetrics(userId: string) {
  const [videoCount, videos, snapshot] = await Promise.all([
    prisma.video.count({ where: { userId } }),
    prisma.video.findMany({
      where: { userId },
      select: { latestViews: true, latestEngagementRate: true },
    }),
    prisma.accountSnapshot.findFirst({
      where: { userId },
      orderBy: { capturedAt: "desc" },
    }),
  ]);

  // Compute averages
  const avgEngagement =
    videos.length > 0
      ? videos.reduce((sum, v) => sum + Number(v.latestEngagementRate), 0) / videos.length
      : 0;

  // Best performing video
  const bestVideo = await prisma.video.findFirst({
    where: { userId },
    orderBy: { latestViews: "desc" },
    select: { latestViews: true, caption: true },
  });

  // Previous period comparison (30 days ago snapshot)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const prevSnapshot = await prisma.accountSnapshot.findFirst({
    where: { userId, capturedAt: { lte: thirtyDaysAgo } },
    orderBy: { capturedAt: "desc" },
  });

  const videoCountTrend = prevSnapshot?.videoCount
    ? ((videoCount - prevSnapshot.videoCount) / prevSnapshot.videoCount) * 100
    : 0;

  // Compute account-level momentum from cached baseline
  const baseline = await getMomentumBaseline(userId);
  const recentVideo = await prisma.video.findFirst({
    where: { userId, postedAt: { not: null } },
    orderBy: { postedAt: "desc" },
    select: { latestViews: true, postedAt: true },
  });
  let momentumValue = 50;
  if (recentVideo?.postedAt) {
    const hoursAlive = Math.max(1, (Date.now() - recentVideo.postedAt.getTime()) / 3600000);
    const vph = Number(recentVideo.latestViews) / hoursAlive;
    momentumValue = computeMomentumScore(vph, baseline);
  }

  return {
    metrics: [
      {
        title: "Total Videos Analyzed",
        value: formatCount(videoCount),
        trend: Math.round(videoCountTrend * 10) / 10,
        icon: "PlaySquare",
      },
      {
        title: "Average Engagement",
        value: formatEngagement(avgEngagement),
        trend: 0,
        icon: "Activity",
      },
      {
        title: "Best Performing Video",
        value: bestVideo ? `${formatCount(Number(bestVideo.latestViews))} views` : "N/A",
        trend: 0,
        icon: "BarChart3",
      },
      {
        title: "Current Momentum",
        value: String(momentumValue),
        trend: 0,
        icon: "TrendingUp",
      },
    ],
    snapshot: snapshot
      ? {
          followerCount: snapshot.followerCount,
          followingCount: snapshot.followingCount,
          videoCount: snapshot.videoCount,
          likeCount: snapshot.likeCount ? Number(snapshot.likeCount) : null,
        }
      : null,
  };
}

export async function getDashboardOverview(userId: string) {
  const [metrics, recentVideos, recommendations, formatInsights, charts] = await Promise.all([
    getDashboardMetrics(userId),
    getRecentVideos(userId),
    getActiveRecommendations(userId, 3),
    getFormatInsights(userId),
    getMomentumChart(userId),
  ]);

  return { ...metrics, recentVideos, recommendations, formatInsights, charts };
}

export async function getRecentVideos(userId: string, limit = 4) {
  const videos = await prisma.video.findMany({
    where: { userId },
    orderBy: { postedAt: "desc" },
    take: limit,
    select: {
      id: true,
      caption: true,
      thumbnailUrl: true,
      formatTag: true,
      postedAt: true,
      latestViews: true,
      latestLikes: true,
      latestComments: true,
      latestShares: true,
      latestEngagementRate: true,
    },
  });

  // Use cached baseline instead of loading all videos
  const baseline = await getMomentumBaseline(userId);
  const now = Date.now();

  return videos.map((v) => {
    const hoursAlive = v.postedAt ? Math.max(1, (now - v.postedAt.getTime()) / 3600000) : 1;
    const vph = Number(v.latestViews) / hoursAlive;

    return {
      id: v.id,
      thumbnailUrl: v.thumbnailUrl,
      caption: v.caption,
      views: formatCount(v.latestViews),
      likes: formatCount(v.latestLikes),
      comments: formatCount(v.latestComments),
      shares: formatCount(v.latestShares),
      engagementScore: Math.round(Number(v.latestEngagementRate) * 1000) / 10,
      momentumScore: computeMomentumScore(vph, baseline),
    };
  });
}

export async function getActiveRecommendations(userId: string, limit = 3) {
  const recs = await prisma.recommendation.findMany({
    where: { userId, isDismissed: false },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return recs.map((r, i) => {
    const json = r.recommendationJson as any;
    const ideas = json.post_ideas || [];
    const idea = ideas[0] || {};

    return {
      id: r.id,
      concept: idea.topic || idea.hook || "Content Idea",
      length: idea.recommended_length || "15-30s",
      hookStyle: idea.hook || "Question hook",
      postingTime: idea.posting_window || "6:00 PM EST",
      formatType: idea.format || "Tutorial",
      confidence: idea.confidence || 0.8,
      isPrimary: i === 0,
    };
  });
}

export async function getFormatInsights(userId: string) {
  // Query format performance from the materialized view via raw SQL
  const formatPerf = (await prisma
    .$queryRawUnsafe(
      `
    SELECT format_tag, video_count, avg_engagement, median_engagement, peak_engagement
    FROM mv_format_performance
    WHERE user_id = $1::uuid
    ORDER BY avg_engagement DESC
    LIMIT 4
  `,
      userId,
    )
    .catch(() => [])) as Array<{
    format_tag: string;
    video_count: number;
    avg_engagement: number;
    median_engagement: number;
    peak_engagement: number;
  }>;

  if (formatPerf.length === 0) {
    // Fallback: compute from videos table directly
    const videos = await prisma.video.groupBy({
      by: ["formatTag"],
      where: { userId, formatTag: { not: null } },
      _avg: { latestEngagementRate: true },
      _count: true,
      orderBy: { _avg: { latestEngagementRate: "desc" } },
      take: 4,
    });

    return videos.map((v, i) => ({
      format: v.formatTag || "Unknown",
      description: FORMAT_DESCRIPTIONS[v.formatTag || ""] || "Content format analysis.",
      avgEngagement: formatEngagement(Number(v._avg.latestEngagementRate || 0)),
      confidence: Math.max(30, 95 - i * 15),
      trend: i < 2 ? "up" : i === 2 ? "stable" : ("down" as const),
    }));
  }

  return formatPerf.map((f, i) => ({
    format: f.format_tag,
    description: FORMAT_DESCRIPTIONS[f.format_tag] || "Content format analysis.",
    avgEngagement: formatEngagement(Number(f.avg_engagement)),
    confidence: Math.max(30, 95 - i * 15),
    trend: (i < 2 ? "up" : i === 2 ? "stable" : "down") as "up" | "stable" | "down",
  }));
}

export async function getMomentumChart(userId: string) {
  // Get metrics snapshots over the last 30 days, grouped by day
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const snapshots = await prisma.videoMetricsSnapshot.findMany({
    where: {
      video: { userId },
      capturedAt: { gte: thirtyDaysAgo },
    },
    select: { views: true, capturedAt: true, engagementRate: true },
    orderBy: { capturedAt: "asc" },
  });

  // Group by date and compute daily momentum
  const byDate = new Map<string, { views: number; count: number }>();
  for (const s of snapshots) {
    const key = s.capturedAt.toISOString().slice(0, 10);
    const entry = byDate.get(key) || { views: 0, count: 0 };
    entry.views += Number(s.views);
    entry.count++;
    byDate.set(key, entry);
  }

  const momentumData = Array.from(byDate.entries()).map(([date, data], i) => ({
    name: String(i + 1),
    date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: Math.min(100, Math.round((data.views / Math.max(1, data.count)) / 100)),
  }));

  // Format engagement bar chart
  const formatData = await prisma.video.groupBy({
    by: ["formatTag"],
    where: { userId, formatTag: { not: null } },
    _avg: { latestEngagementRate: true },
    orderBy: { _avg: { latestEngagementRate: "desc" } },
    take: 6,
  });

  return {
    momentumData,
    formatData: formatData.map((f) => ({
      name: f.formatTag || "Other",
      engagement: Math.round(Number(f._avg.latestEngagementRate || 0) * 1000) / 10,
    })),
  };
}

// --- Constants ---

const FORMAT_DESCRIPTIONS: Record<string, string> = {
  tutorial: "Step-by-step guides explaining a specific process or tool.",
  product_demo: "Showcasing physical or digital products in action.",
  story: "Talking head videos with personal anecdotes or background stories.",
  reaction: "Duets or stitches reacting to trending topics or other videos.",
  faceless_demo: "Faceless product demos with text overlays and voiceover.",
  listicle: "List-format content like 'Top 5' or 'Things you need'.",
  talking_head: "Direct-to-camera commentary or opinion pieces.",
};
