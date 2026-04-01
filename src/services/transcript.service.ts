import prisma from "../config/database";

export async function upsertVideoTranscript(payload: Record<string, unknown>) {
  const videoUrl = String(payload.video_url ?? "");

  return prisma.videoTranscript.upsert({
    where: { videoUrl },
    update: mapTranscriptPayload(payload),
    create: {
      videoUrl,
      ...mapTranscriptPayload(payload),
    },
  });
}

export async function getVideoTranscripts(params: { niche?: string; page?: number; limit?: number }) {
  const { niche, page = 1, limit = 20 } = params;

  return prisma.videoTranscript.findMany({
    where: niche ? { niche } : undefined,
    orderBy: { analyzedAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export async function getVideoTranscriptById(id: string) {
  return prisma.videoTranscript.findUnique({ where: { id } });
}

export async function getHookPatterns(type?: string) {
  const rows = await prisma.videoTranscript.groupBy({
    by: ["hookType", "niche"],
    where: type ? { hookType: type } : undefined,
    _count: true,
    orderBy: { _count: { hookType: "desc" } },
  });

  return rows.map((row) => ({
    niche: row.niche,
    hookType: row.hookType,
    count: row._count,
  }));
}

export async function getStructureBreakdown() {
  const rows = await prisma.videoTranscript.groupBy({
    by: ["scriptStructure", "niche"],
    _count: true,
    orderBy: { _count: { scriptStructure: "desc" } },
  });

  return rows.map((row) => ({
    niche: row.niche,
    scriptStructure: row.scriptStructure,
    count: row._count,
  }));
}

function mapTranscriptPayload(payload: Record<string, unknown>) {
  return {
    platform: toStringOrDefault(payload.platform, "tiktok"),
    niche: toNullableString(payload.niche),
    creatorHandle: toNullableString(payload.creator_handle),
    transcript: toNullableString(payload.transcript),
    wordCount: toNumber(payload.word_count),
    estimatedDurationSeconds: toNumber(payload.estimated_duration_seconds),
    hook: toNullableString(payload.hook),
    hookType: toNullableString(payload.hook_type),
    cta: toNullableString(payload.cta),
    ctaType: toNullableString(payload.cta_type),
    scriptStructure: toNullableString(payload.script_structure),
    tone: toNullableString(payload.tone),
    productMentions: toNullableString(payload.product_mentions),
    keyPhrases: toNullableString(payload.key_phrases),
    contentSummary: toNullableString(payload.content_summary),
    rawDeepseekResponse:
      payload.raw_deepseek_response && typeof payload.raw_deepseek_response === "object"
        ? payload.raw_deepseek_response
        : undefined,
    sourceNicheScanId: toNullableString(payload.source_niche_scan_id),
  };
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function toStringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
