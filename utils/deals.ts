/**
 * Deal types and helpers for pricing and classification.
 */

export type Deal = {
  title: string;
  image: string;
  listPrice: number; // Original price
  currentPrice: number; // Discounted price (0 for free)
  platforms: string[];
  // IDs from CheapShark for detail/link enrichment
  dealId?: string;     // CheapShark dealID
  gameId?: string;     // CheapShark gameID
  steamAppId?: string; // Steam app id when available
  // Optional per-platform claim links (when available from data source)
  // Keys should match the platform identifiers in `platforms`.
  claimLinks?: Record<string, string>;
  // Optional quality signals (from CheapShark/Steam/Metacritic)
  steamRatingPercent?: number; // 0..100
  steamRatingCount?: number;   // number of reviews
  metacriticScore?: number;    // 0..100, 0 or undefined if unknown
  dealRating?: number;         // CheapShark's internal 0..10
};

/**
 * Classify a deal using both percent-off and absolute savings.
 * - free: currentPrice <= $0.01
 * - insane: discountPercent >= 40 AND (discountPercent + 3 * (savings / 10)) >= 70
 * - sale: everything else with a meaningful discount
 */
export function classifyDeal(
  listPrice: number,
  currentPrice: number
): 'free' | 'insane' | 'sale' {
  // Free takes priority
  if (currentPrice <= 0.01) return 'free';
  if (listPrice <= 0) return 'sale';

  // Discount fraction D in [0,1]
  const discountFraction = Math.max(0, Math.min(1, (listPrice - currentPrice) / listPrice));

  // New score: S = D * log10(P + 1), where P is original list price (in dollars)
  const score = discountFraction * Math.log10(listPrice + 1);

  // Reasonable default thresholds (tune in docs):
  // - require at least 40% off to avoid tiny-amount "insane" on pricey titles
  // - and score >= 1.0 (works well around $40–$60 AAA with 50–60% off)
  const isInsane = discountFraction >= 0.4 && score >= 1.0;

  if (isInsane) return 'insane';

  // Otherwise, consider it a regular sale if at least ~15% off
  const discountPercent = Math.round(discountFraction * 100);
  if (discountPercent >= 15) return 'sale';
  return 'sale';
}

/**
 * Compute discount metrics used for ranking and sorting.
 * - discountFraction D in [0,1]
 * - score S = D * log10(P + 1)
 * - discountPercent (rounded)
 * - savings dollars
 */
export function computeDealScore(listPrice: number, currentPrice: number): {
  discountFraction: number;
  score: number;
  discountPercent: number;
  savings: number;
} {
  if (listPrice <= 0) {
    return { discountFraction: 0, score: 0, discountPercent: 0, savings: 0 };
  }
  const savings = Math.max(0, listPrice - currentPrice);
  const discountFraction = Math.max(0, Math.min(1, savings / listPrice));
  const score = discountFraction * Math.log10(listPrice + 1);
  const discountPercent = Math.round(discountFraction * 100);
  return { discountFraction, score, discountPercent, savings };
}

/**
 * Light-weight quality bucketing so we can filter out shovelware.
 * Rules (tune as needed):
 * - great: Steam rating ≥ 90% AND count ≥ 1000, OR Metacritic ≥ 85
 * - good: Steam rating ≥ 80% AND count ≥ 200, OR Metacritic ≥ 75
 * - unknown: not enough info
 */
export function qualityTier(deal: Deal): 'great' | 'good' | 'unknown' {
  const srp = deal.steamRatingPercent ?? 0;
  const src = deal.steamRatingCount ?? 0;
  const meta = deal.metacriticScore ?? 0;

  const isGreat = (srp >= 90 && src >= 1000) || meta >= 85;
  if (isGreat) return 'great';
  const isGood = (srp >= 80 && src >= 200) || meta >= 75;
  if (isGood) return 'good';
  return 'unknown';
}

/**
 * Classify a deal with price math + quality gating for 'insane'.
 * We gate 'insane' behind at least 'good' quality to avoid promoting shovelware.
 */
export function classifyDealWithQuality(deal: Deal): 'free' | 'insane' | 'sale' {
  const base = classifyDeal(deal.listPrice, deal.currentPrice);
  if (base !== 'insane') return base;
  const qt = qualityTier(deal);
  return qt === 'great' || qt === 'good' ? 'insane' : 'sale';
}

/**
 * Format the display price, adding the percent-off when relevant.
 * Example: $9.99 (-60%) or Free
 */
export function formatPrice(listPrice: number, currentPrice: number): string {
  if (currentPrice <= 0.01) return 'Free';
  const discountPercent = Math.round((1 - currentPrice / listPrice) * 100);
  const price = `$${currentPrice.toFixed(2)}`;
  return `${price} (${discountPercent > 0 ? `-${discountPercent}%` : 'no discount'})`;
}
