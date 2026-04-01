import prisma from "../config/database";

export async function upsertNicheDiscovery(payload: Record<string, unknown>) {
  const nicheName = String(payload.niche_name ?? "");
  const source = String(payload.source ?? "amazon_movers");

  return prisma.nicheDiscovery.upsert({
    where: {
      nicheName_source: {
        nicheName,
        source,
      },
    },
    update: mapDiscoveryPayload(payload),
    create: {
      nicheName,
      source,
      ...mapDiscoveryPayload(payload),
    },
  });
}

export async function getDiscoveries(limit = 50) {
  return prisma.nicheDiscovery.findMany({
    orderBy: [{ convertibilityScore: "desc" }, { discoveredAt: "desc" }],
    take: limit,
  });
}

export async function getRecentDiscoveries(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.nicheDiscovery.findMany({
    where: { discoveredAt: { gte: since } },
    orderBy: { discoveredAt: "desc" },
    take: 100,
  });
}

export async function getDiscoveryById(id: string) {
  return prisma.nicheDiscovery.findUnique({ where: { id } });
}

export async function getDesireHeatmap() {
  const rows = await prisma.nicheDiscovery.findMany({
    select: {
      desireHealth: true,
      desireWealth: true,
      desireSex: true,
      desireStatus: true,
      desireFear: true,
      desireIdentity: true,
    },
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.health += Number(row.desireHealth);
      acc.wealth += Number(row.desireWealth);
      acc.sex += Number(row.desireSex);
      acc.status += Number(row.desireStatus);
      acc.fear += Number(row.desireFear);
      acc.identity += Number(row.desireIdentity);
      return acc;
    },
    { health: 0, wealth: 0, sex: 0, status: 0, fear: 0, identity: 0 },
  );

  const count = Math.max(rows.length, 1);

  return Object.entries(totals).map(([desire, total]) => ({
    desire,
    averageScore: Number((total / count).toFixed(2)),
  }));
}

function mapDiscoveryPayload(payload: Record<string, unknown>) {
  return {
    hashtag: toNullableString(payload.hashtag),
    sourceCategory: toNullableString(payload.source_category),
    sourceProduct: toNullableString(payload.source_product),
    desireHealth: toDecimal(payload.desire_health) ?? 0,
    desireWealth: toDecimal(payload.desire_wealth) ?? 0,
    desireSex: toDecimal(payload.desire_sex) ?? 0,
    desireStatus: toDecimal(payload.desire_status) ?? 0,
    desireFear: toDecimal(payload.desire_fear) ?? 0,
    desireIdentity: toDecimal(payload.desire_identity) ?? 0,
    desirePullScore: toDecimal(payload.desire_pull_score) ?? 0,
    dominantDesire: toNullableString(payload.dominant_desire),
    reviewCountAnalyzed: toNumber(payload.review_count_analyzed),
    reviewPassionScore: toDecimal(payload.review_passion_score) ?? 0,
    avgPricePoint: toDecimal(payload.avg_price_point),
    impulseBuyScore: toDecimal(payload.impulse_buy_score) ?? 0,
    convertibilityScore: toDecimal(payload.convertibility_score) ?? 0,
    opportunityTier: toNullableString(payload.opportunity_tier),
    tiktokInfrastructure: toDecimal(payload.tiktok_infrastructure) ?? 0,
    tiktokProductCount: toNumber(payload.tiktok_product_count),
    tiktokSellerCount: toNumber(payload.tiktok_seller_count),
    addedToWatchlist: Boolean(payload.added_to_watchlist),
  };
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function toDecimal(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return Number(value);
}
