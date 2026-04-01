import prisma from "../config/database";
import { getRecentDiscoveries } from "./discovery.service";
import { getHookPatterns } from "./transcript.service";

export async function getDashboardSummary() {
  const [totalNichesTracked, goldOpportunities, videosAnalyzed, topNiches, recentDiscoveries, hookPatterns] =
    await Promise.all([
      prisma.nicheIntelligence.groupBy({ by: ["nicheName"] }).then((rows) => rows.length),
      prisma.nicheIntelligence.count({ where: { opportunityTier: "gold", isOpportunity: true } }),
      prisma.videoTranscript.count(),
      prisma.nicheIntelligence.findMany({
        where: { isOpportunity: true },
        orderBy: [{ opportunityScore: "desc" }, { scanDate: "desc" }],
        take: 5,
      }),
      getRecentDiscoveries(7).then((rows) => rows.slice(0, 5)),
      getHookPatterns(),
    ]);

  return {
    totalNichesTracked,
    goldOpportunities,
    videosAnalyzed,
    topNiches,
    recentDiscoveries,
    hookPatterns,
  };
}
