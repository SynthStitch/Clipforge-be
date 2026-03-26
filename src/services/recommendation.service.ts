import prisma from "../config/database";

export async function getRecommendations(userId: string) {
  const recs = await prisma.recommendation.findMany({
    where: { userId, isDismissed: false },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Split into primary (highest confidence) and experimental
  const mapped = recs.map((r) => {
    const json = r.recommendationJson as any;
    const ideas = json.post_ideas || [];
    return {
      id: r.id,
      createdAt: r.createdAt,
      ideas: ideas.map((idea: any) => ({
        concept: idea.topic || idea.hook || "Content Idea",
        length: idea.recommended_length || "15-30s",
        hookStyle: idea.hook || "Question hook",
        postingTime: idea.posting_window || "6:00 PM EST",
        formatType: idea.format || "Tutorial",
        confidence: idea.confidence || 0.5,
        productAngle: idea.product_angle || null,
      })),
    };
  });

  // Flatten all ideas and sort by confidence
  const allIdeas = mapped.flatMap((r) =>
    r.ideas.map((idea: any) => ({ ...idea, recommendationId: r.id, createdAt: r.createdAt })),
  );
  allIdeas.sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0));

  const primary = allIdeas.filter((i: any) => (i.confidence || 0) >= 0.7).slice(0, 3);
  const experimental = allIdeas.filter((i: any) => (i.confidence || 0) < 0.7).slice(0, 3);

  return {
    primary: primary.map((idea: any, i: number) => ({ ...idea, isPrimary: i === 0 })),
    experimental,
    updatedAt: recs[0]?.createdAt || null,
  };
}

export async function dismissRecommendation(userId: string, recommendationId: string) {
  const rec = await prisma.recommendation.findFirst({
    where: { id: recommendationId, userId },
  });
  if (!rec) return null;

  return prisma.recommendation.update({
    where: { id: recommendationId },
    data: { isDismissed: true },
  });
}
