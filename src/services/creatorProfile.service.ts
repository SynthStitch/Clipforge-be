import prisma from "../config/database";

export async function upsertCreatorProfile(payload: Record<string, unknown>) {
  const username = String(payload.username ?? "");
  const nicheName = String(payload.niche_name ?? "");
  const scannedAt = payload.scanned_at
    ? new Date(String(payload.scanned_at))
    : new Date();

  return prisma.creatorProfile.upsert({
    where: {
      username_nicheName_scannedAt: { username, nicheName, scannedAt },
    },
    update: mapPayload(payload),
    create: { username, nicheName, scannedAt, ...mapPayload(payload) },
  });
}

export async function getCreatorsByNiche(nicheName: string) {
  return prisma.creatorProfile.findMany({
    where: { nicheName },
    orderBy: { avgViews: "desc" },
    take: 50,
  });
}

export async function getCreatorByUsername(username: string) {
  return prisma.creatorProfile.findMany({
    where: { username },
    orderBy: { scannedAt: "desc" },
    take: 20,
  });
}

function mapPayload(p: Record<string, unknown>) {
  return {
    displayName: toNullableString(p.display_name),
    hashtag: toNullableString(p.hashtag),
    followers: toNumber(p.followers),
    verified: Boolean(p.verified),
    avgViews: toBigInt(p.avg_views),
    engagementRatePct: toDecimal(p.engagement_rate_pct) ?? 0,
    postingFreqPerWeek: toDecimal(p.posting_freq_per_week) ?? 0,
    bestVideoViews: toBigInt(p.best_video_views),
    totalViewsRecent: toBigInt(p.total_views_recent),
    totalLikesRecent: toBigInt(p.total_likes_recent),
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
