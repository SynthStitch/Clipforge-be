import prisma from "../config/database";

interface NicheQueryOptions {
  page?: number;
  limit?: number;
}

export async function upsertNicheIntelligence(payload: Record<string, unknown>) {
  const nicheName = String(payload.niche_name ?? "");
  const scanDateValue = String(payload.scan_date ?? new Date().toISOString().slice(0, 10));

  return prisma.nicheIntelligence.upsert({
    where: {
      nicheName_scanDate: {
        nicheName,
        scanDate: new Date(scanDateValue),
      },
    },
    update: {
      hashtag: toNullableString(payload.hashtag),
      tiktokShopCategory: toNullableString(payload.tiktok_shop_category),
      hashtagVideoCount: toBigInt(payload.hashtag_video_count),
      hashtagViews7d: toBigInt(payload.hashtag_views_7d),
      shopProductCount: toNumber(payload.shop_product_count),
      avgProductPrice: toDecimal(payload.avg_product_price),
      estimatedGmv: toDecimal(payload.estimated_gmv),
      activeCreatorCount: toNumber(payload.active_creator_count),
      activeSellerCount: toNumber(payload.active_seller_count),
      topCreatorFollowers: toBigInt(payload.top_creator_followers),
      saturationScore: toDecimal(payload.saturation_score) ?? 0,
      opportunityScore: toDecimal(payload.opportunity_score) ?? 0,
      revenuePerCreator: toDecimal(payload.revenue_per_creator) ?? 0,
      demandSupplyRatio: toDecimal(payload.demand_supply_ratio) ?? 0,
      creatorCountWow: toDecimal(payload.creator_count_wow),
      productCountWow: toDecimal(payload.product_count_wow),
      gmvWow: toDecimal(payload.gmv_wow),
      isOpportunity: Boolean(payload.is_opportunity),
      opportunityTier: toNullableString(payload.opportunity_tier),
      rawHashtagResponse: toJsonValue(payload.raw_hashtag_response),
      rawShopResponse: toJsonValue(payload.raw_shop_response),
    },
    create: {
      nicheName,
      hashtag: toNullableString(payload.hashtag),
      tiktokShopCategory: toNullableString(payload.tiktok_shop_category),
      hashtagVideoCount: toBigInt(payload.hashtag_video_count),
      hashtagViews7d: toBigInt(payload.hashtag_views_7d),
      shopProductCount: toNumber(payload.shop_product_count),
      avgProductPrice: toDecimal(payload.avg_product_price),
      estimatedGmv: toDecimal(payload.estimated_gmv),
      activeCreatorCount: toNumber(payload.active_creator_count),
      activeSellerCount: toNumber(payload.active_seller_count),
      topCreatorFollowers: toBigInt(payload.top_creator_followers),
      saturationScore: toDecimal(payload.saturation_score) ?? 0,
      opportunityScore: toDecimal(payload.opportunity_score) ?? 0,
      revenuePerCreator: toDecimal(payload.revenue_per_creator) ?? 0,
      demandSupplyRatio: toDecimal(payload.demand_supply_ratio) ?? 0,
      creatorCountWow: toDecimal(payload.creator_count_wow),
      productCountWow: toDecimal(payload.product_count_wow),
      gmvWow: toDecimal(payload.gmv_wow),
      isOpportunity: Boolean(payload.is_opportunity),
      opportunityTier: toNullableString(payload.opportunity_tier),
      rawHashtagResponse: toJsonValue(payload.raw_hashtag_response),
      rawShopResponse: toJsonValue(payload.raw_shop_response),
      scanDate: new Date(scanDateValue),
    },
  });
}

export async function getLatestNiches({ page = 1, limit = 20 }: NicheQueryOptions) {
  const [countResult] = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*) as count FROM (SELECT DISTINCT ON (niche_name) id FROM niche_intelligence ORDER BY niche_name, scan_date DESC, created_at DESC) sub`,
  );
  const total = Number(countResult.count);

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `
      SELECT DISTINCT ON (niche_name) *
      FROM niche_intelligence
      ORDER BY niche_name, scan_date DESC, created_at DESC
      LIMIT $1 OFFSET $2
    `,
    limit,
    (page - 1) * limit,
  );

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getNicheByName(nicheName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `
      SELECT *
      FROM niche_intelligence
      WHERE niche_name = $1
      ORDER BY scan_date DESC, created_at DESC
      LIMIT 1
    `,
    nicheName,
  );

  return rows[0] ?? null;
}

export async function getNicheHistory(nicheName: string, limit = 30) {
  return prisma.nicheIntelligence.findMany({
    where: { nicheName },
    orderBy: { scanDate: "desc" },
    take: limit,
  });
}

export async function getOpportunities(tier?: string) {
  return prisma.nicheIntelligence.findMany({
    where: {
      isOpportunity: true,
      ...(tier ? { opportunityTier: tier } : {}),
    },
    orderBy: [{ opportunityScore: "desc" }, { scanDate: "desc" }],
    take: 100,
  });
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function toBigInt(value: unknown) {
  return BigInt(typeof value === "bigint" ? value : Number(value ?? 0));
}

function toDecimal(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return Number(value);
}

function toJsonValue(value: unknown) {
  return value && typeof value === "object" ? value : undefined;
}
