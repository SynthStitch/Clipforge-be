import prisma from "../config/database";

export async function upsertTrendingSound(payload: Record<string, unknown>) {
  const soundId = String(payload.sound_id ?? "");
  const scannedAt = payload.scanned_at
    ? new Date(String(payload.scanned_at))
    : new Date();

  return prisma.trendingSound.upsert({
    where: { soundId_scannedAt: { soundId, scannedAt } },
    update: mapPayload(payload),
    create: { soundId, scannedAt, ...mapPayload(payload) },
  });
}

export async function getTrendingSounds(limit = 50) {
  return prisma.trendingSound.findMany({
    orderBy: { scannedAt: "desc" },
    take: limit,
  });
}

function mapPayload(p: Record<string, unknown>) {
  return {
    soundTitle: String(p.sound_title ?? ""),
    soundAuthor: toNullableString(p.sound_author),
    isOriginal: Boolean(p.is_original ?? p.original),
    videoCount: toNumber(p.video_count),
    totalViews: toBigInt(p.total_views),
    avgViewsPerVideo: toBigInt(p.avg_views_per_video),
    totalLikes: toBigInt(p.total_likes),
    niches: toNullableString(p.niches),
    commerceRelevance: toDecimal(p.commerce_relevance) ?? 0,
  };
}

function toNullableString(v: unknown) {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function toNumber(v: unknown) {
  return typeof v === "number" ? v : Number(v ?? 0);
}
function toBigInt(v: unknown) {
  return BigInt(typeof v === "bigint" ? v : Number(v ?? 0));
}
function toDecimal(v: unknown) {
  return v === null || v === undefined || v === "" ? null : Number(v);
}
