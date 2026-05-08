import { Prisma } from "@prisma/client";
import prisma from "../config/database";

export async function upsertVideoTranscript(payload: Record<string, unknown>) {
  const videoUrl = String(payload.video_url ?? "");

  return prisma.videoTranscript.upsert({
    where: { videoUrl },
    update: { ...mapTranscriptPayload(payload), analyzedAt: new Date() },
    create: {
      videoUrl,
      ...mapTranscriptPayload(payload),
    },
  });
}

export async function upsertTranscriptLabel(payload: Record<string, unknown>) {
  const videoUrl = String(payload.video_url ?? "");

  const transcript = await prisma.videoTranscript.findUnique({ where: { videoUrl } });
  if (!transcript) {
    throw new Error(`VideoTranscript not found for url: ${videoUrl}`);
  }

  return prisma.transcriptLabel.upsert({
    where: { videoTranscriptId: transcript.id },
    update: mapLabelPayload(payload),
    create: {
      videoTranscriptId: transcript.id,
      ...mapLabelPayload(payload),
    },
  });
}

function mapLabelPayload(payload: Record<string, unknown>) {
  return {
    hookType: toNullableString(payload.hook_type),
    hookScore: toOptionalInt(payload.hook_score),
    structureCompleteness: typeof payload.structure_completeness === "number" ? payload.structure_completeness : null,
    productRevealTiming: toNullableString(payload.product_reveal_timing),
    hasEnemyFraming: Boolean(payload.has_enemy_framing ?? false),
    hasObjectionHandling: Boolean(payload.has_objection_handling ?? false),
    hasVisionPainting: Boolean(payload.has_vision_painting ?? false),
    hasBrandDifferentiation: Boolean(payload.has_brand_differentiation ?? false),
    emotionalArc: toNullableString(payload.emotional_arc),
    overallPersuasionScore: typeof payload.overall_persuasion_score === "number" ? payload.overall_persuasion_score : null,
    repurposabilityScore: toOptionalInt(payload.repurposability_score),
    viralityTier: toNullableString(payload.virality_tier),
    views: typeof payload.views === "number" ? BigInt(payload.views) : null,
    likes: typeof payload.likes === "number" ? BigInt(payload.likes) : null,
    comments: typeof payload.comments === "number" ? BigInt(payload.comments) : null,
    shares: typeof payload.shares === "number" ? BigInt(payload.shares) : null,
    segments: Array.isArray(payload.segments) ? (payload.segments as Prisma.InputJsonValue) : Prisma.DbNull,
    labelerNotes: toNullableString(payload.labeler_notes),
    labeledBy: toNullableString(payload.labeled_by),
  };
}

function toOptionalInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  return null;
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

export async function getTranscriptLabel(transcriptId: string) {
  return prisma.transcriptLabel.findUnique({ where: { videoTranscriptId: transcriptId } });
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
