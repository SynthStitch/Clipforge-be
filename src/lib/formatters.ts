/**
 * Format large numbers for frontend display.
 * 1234 → "1.2K", 1234567 → "1.2M", 1234567890 → "1.2B"
 */
export function formatCount(n: number | bigint): string {
  const num = typeof n === "bigint" ? Number(n) : n;
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Format engagement rate as percentage string.
 * 0.084 → "8.4%"
 */
export function formatEngagement(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Compute a 0-100 momentum score from views-per-hour velocity
 * relative to a baseline. Simple sigmoid normalization.
 */
export function computeMomentumScore(viewsPerHour: number, baseline: number): number {
  if (baseline <= 0) return 50;
  const ratio = viewsPerHour / baseline;
  // Sigmoid mapping: ratio of 1 → ~50, ratio of 3 → ~95
  const score = 100 / (1 + Math.exp(-2 * (ratio - 1)));
  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Map format_tag DB values to frontend display names.
 */
export function formatTagToDisplay(tag: string | null): string {
  const map: Record<string, string> = {
    tutorial: "Tutorial",
    story: "Story Format",
    product_demo: "Product Demo",
    reaction: "Reaction Style",
    faceless_demo: "Faceless Demo",
    listicle: "Listicle",
    talking_head: "Talking Head",
    opinion: "Opinion",
    unboxing: "Unboxing",
    review: "Review",
    other: "Other",
  };
  return tag ? map[tag] || tag : "Unknown";
}
