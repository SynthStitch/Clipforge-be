import prisma from "../config/database";
import { getFormatInsights, getMomentumChart } from "./dashboard.service";

export async function getInsights(userId: string) {
  const [brief, demographics, formatInsights, charts] = await Promise.all([
    getCurrentBrief(userId),
    getAudienceDemographics(userId),
    getFormatInsights(userId),
    getMomentumChart(userId),
  ]);

  return { brief, demographics, formatInsights, charts };
}

export async function getCurrentBrief(userId: string) {
  const brief = await prisma.creativeBrief.findFirst({
    where: { userId, isCurrent: true },
    orderBy: { createdAt: "desc" },
  });

  if (!brief) return null;

  const json = brief.briefJson as any;
  return {
    id: brief.id,
    version: brief.version,
    createdAt: brief.createdAt,
    accountSummary: json.account_summary || {},
    audienceSignals: json.audience_signals || {},
    nicheRecommendations: json.niche_recommendations || [],
    creativeBrief: json.creative_brief || {},
    performanceSnapshot: json.performance_snapshot || {},
  };
}

export async function getAudienceDemographics(userId: string) {
  // Pull audience signals from the latest creative brief
  const brief = await prisma.creativeBrief.findFirst({
    where: { userId, isCurrent: true },
    orderBy: { createdAt: "desc" },
  });

  // Pull entity-based audience signals
  const entities = await prisma.extractedEntity.groupBy({
    by: ["entityType"],
    where: { userId },
    _count: true,
    orderBy: { _count: { entityType: "desc" } },
  });

  // Pull top audience signals by type
  const [objections, desires, questions] = await Promise.all([
    prisma.extractedEntity.findMany({
      where: { userId, entityType: "objection" },
      orderBy: { confidence: "desc" },
      take: 5,
      select: { entityValue: true, confidence: true },
    }),
    prisma.extractedEntity.findMany({
      where: { userId, entityType: "desire" },
      orderBy: { confidence: "desc" },
      take: 5,
      select: { entityValue: true, confidence: true },
    }),
    prisma.extractedEntity.findMany({
      where: { userId, entityType: "question" },
      orderBy: { confidence: "desc" },
      take: 5,
      select: { entityValue: true, confidence: true },
    }),
  ]);

  const briefJson = brief?.briefJson as any;

  return {
    // From brief audience signals
    audienceSignals: briefJson?.audience_signals || {
      common_objections: objections.map((o) => o.entityValue),
      common_desires: desires.map((d) => d.entityValue),
      recurring_questions: questions.map((q) => q.entityValue),
    },
    entityBreakdown: entities.map((e) => ({
      type: e.entityType,
      count: e._count,
    })),
    // TikTok audience demographics aren't available via API v2 user.info
    // These would need to come from the creator's TikTok Analytics export
    // or be populated via the n8n workflow. Placeholder structure:
    gender: briefJson?.demographics?.gender || null,
    ageDistribution: briefJson?.demographics?.age || null,
    topTerritories: briefJson?.demographics?.territories || null,
  };
}
