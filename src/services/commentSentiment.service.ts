import prisma from "../config/database";

export async function upsertCommentSentiment(payload: Record<string, unknown>) {
  const videoUrl = String(payload.video_url ?? "");

  return prisma.commentSentiment.upsert({
    where: { videoUrl },
    update: mapPayload(payload),
    create: { videoUrl, ...mapPayload(payload) },
  });
}

export async function getCommentSentimentByNiche(niche: string) {
  return prisma.commentSentiment.findMany({
    where: { niche },
    orderBy: { analyzedAt: "desc" },
    take: 50,
  });
}

function mapPayload(p: Record<string, unknown>) {
  return {
    videoId: toNullableString(p.video_id),
    niche: toNullableString(p.niche),
    totalComments: toNumber(p.total_comments),
    purchaseIntentCount: toNumber(p.purchase_intent_count),
    purchaseIntentPct: toDecimal(p.purchase_intent_pct) ?? 0,
    objectionCount: toNumber(p.objection_count),
    objectionThemes: toNullableString(p.objection_themes),
    socialProofCount: toNumber(p.social_proof_count),
    questionThemes: toNullableString(p.question_themes),
    emotionalIntensity: toDecimal(p.emotional_intensity) ?? 0,
    dominantSentiment: toNullableString(p.dominant_sentiment),
    topPurchaseComments: toNullableString(p.top_purchase_comments),
    topObjections: toNullableString(p.top_objections),
  };
}

function toNullableString(v: unknown) {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function toNumber(v: unknown) {
  return typeof v === "number" ? v : Number(v ?? 0);
}
function toDecimal(v: unknown) {
  return v === null || v === undefined || v === "" ? null : Number(v);
}
