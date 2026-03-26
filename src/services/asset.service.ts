import prisma from "../config/database";

interface AssetFilters {
  userId: string;
  status?: string;
  contentBranch?: string;
  assetType?: string;
  page?: number;
  limit?: number;
}

export async function getAssets(filters: AssetFilters) {
  const { userId, status, contentBranch, assetType, page = 1, limit = 20 } = filters;

  const where: any = { userId };
  if (status) where.status = status;
  if (contentBranch) where.contentBranch = contentBranch;
  if (assetType) where.assetType = assetType;

  const [total, assets] = await Promise.all([
    prisma.generatedAsset.count({ where }),
    prisma.generatedAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        recommendation: {
          select: { recommendationJson: true },
        },
      },
    }),
  ]);

  return {
    assets: assets.map((a) => ({
      id: a.id,
      assetType: a.assetType,
      contentBranch: a.contentBranch,
      provider: a.provider,
      status: a.status,
      outputUrl: a.outputUrl,
      outputMetadata: a.outputMetadata,
      errorMessage: a.errorMessage,
      createdAt: a.createdAt,
      completedAt: a.completedAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getAssetById(userId: string, assetId: string) {
  return prisma.generatedAsset.findFirst({
    where: { id: assetId, userId },
    include: {
      recommendation: { select: { recommendationJson: true } },
      creativeBrief: { select: { briefJson: true, version: true } },
    },
  });
}
