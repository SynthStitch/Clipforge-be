import prisma from "../config/database";

export async function upsertContentPerformance(payload: Record<string, unknown>) {
  const videoId = String(payload.video_id ?? "");

  return prisma.contentPerformance.upsert({
    where: { videoId },
    update: mapPayload(payload),
    create: { videoId, ...mapPayload(payload) },
  });
}

export async function getPerformanceByNiche(niche: string) {
  return prisma.contentPerformance.findMany({
    where: { niche },
    orderBy: { measuredAt: "desc" },
    take: 50,
  });
}

export async function getAllPerformance(limit = 50) {
  return prisma.contentPerformance.findMany({
    orderBy: { measuredAt: "desc" },
    take: limit,
  });
}

function mapPayload(p: Record<string, unknown>) {
  return {
    videoUrl: toNullableString(p.video_url),
    niche: toNullableString(p.niche),
    contentBriefId: toNullableString(p.content_brief_id),
    hookTypeUsed: toNullableString(p.hook_type_used),
    structureUsed: toNullableString(p.structure_used),
    views24h: toBigInt(p.views_24h),
    likes24h: toBigInt(p.likes_24h),
    comments24h: toBigInt(p.comments_24h),
    shares24h: toBigInt(p.shares_24h),
    engagementRate24h: toDecimal(p.engagement_rate_24h) ?? 0,
    viewsVsAvgPct: toDecimal(p.views_vs_avg_pct),
    engagementVsAvgPct: toDecimal(p.engagement_vs_avg_pct),
    aboveAverage: Boolean(p.above_average),
    postedAt: p.posted_at ? new Date(String(p.posted_at)) : null,
    measuredAt: p.measured_at ? new Date(String(p.measured_at)) : new Date(),
  };
}

function toNullableString(v: unknown) {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function toBigInt(v: unknown) {
  return BigInt(typeof v === "bigint" ? v : Number(v ?? 0));
}
function toDecimal(v: unknown) {
  return v === null || v === undefined || v === "" ? null : Number(v);
}
