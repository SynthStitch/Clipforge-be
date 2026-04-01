import prisma from "../config/database";

export async function upsertShopSnapshot(payload: Record<string, unknown>) {
  const shopName = String(payload.shop_name ?? "");

  return prisma.shopSnapshot.create({
    data: {
      shopName,
      shopUrl: toNullableString(payload.shop_url),
      niche: toNullableString(payload.niche),
      productCount: toNumber(payload.product_count),
      avgPrice: toDecimal(payload.avg_price),
      newProducts: toNumber(payload.new_products),
      priceChangePct: toDecimal(payload.price_change_pct),
      hasChanges: Boolean(payload.has_changes),
      topProducts:
        payload.top_products && typeof payload.top_products === "object"
          ? payload.top_products
          : undefined,
      scannedAt: payload.scanned_at
        ? new Date(String(payload.scanned_at))
        : new Date(),
    },
  });
}

export async function getShopSnapshots(shopName: string, limit = 30) {
  return prisma.shopSnapshot.findMany({
    where: { shopName },
    orderBy: { scannedAt: "desc" },
    take: limit,
  });
}

export async function getTrackedShops() {
  const rows = await prisma.shopSnapshot.findMany({
    distinct: ["shopName"],
    orderBy: { scannedAt: "desc" },
    take: 100,
  });
  return rows;
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
