/**
 * CheapShark API client (strongly typed + annotated for learning)
 *
 * Why a small client module?
 * - Centralizes fetch logic, query params, and mapping to our app's Deal type
 * - Easy to add caching/throttling and unit tests
 * - Keeps UI components simple
 */

const BASE_URL = 'https://www.cheapshark.com/api/1.0';

/** Basic GET wrapper with query params and simple error handling. */
async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  // Ensure we don't lose the /api/1.0 segment: strip any leading slash from path
  // and make sure BASE_URL ends with a trailing slash before joining.
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/';
  const normalizedPath = path.replace(/^\//, '');
  const url = new URL(normalizedBase + normalizedPath);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      // For production, add retry/backoff on 429/5xx and better error payloads
      const text = await res.text().catch(() => '');
      throw new Error(`CheapShark ${res.status} ${res.statusText}: ${text}`);
    }
    return res.json() as Promise<T>;
  } catch (e: any) {
    // On web preview, CORS can block third-party APIs. Surface a helpful message.
    const msg = e?.message || String(e);
    throw new Error(`Network error loading CheapShark data. If you're running in a web browser, this may be blocked by CORS. Try Expo Go or an emulator.\n${msg}`);
  }
}

/**
 * Stores endpoint response shape.
 * Reference: GET /stores
 */
export type CheapSharkStore = {
  storeID: string; // numeric string
  storeName: string;
  isActive: 0 | 1;
  images: {
    banner: string;
    logo: string;
    icon: string;
  };
};

/** Deals endpoint response item. Reference: GET /deals */
export type CheapSharkDeal = {
  internalName: string;
  title: string;
  metacriticLink: string | null;
  dealID: string;
  storeID: string; // numeric string
  gameID: string;
  salePrice: string; // stringified number
  normalPrice: string; // stringified number
  isOnSale: '0' | '1';
  savings: string; // percent saved as string (e.g., '75.000000')
  steamRatingText: string | null;
  steamRatingPercent: string; // '0' if unknown
  steamRatingCount: string;
  steamAppID: string | null;
  releaseDate: number; // unix seconds
  lastChange: number; // unix seconds
  dealRating: string; // stringified number 0..10
  thumb: string; // image url
};

/**
 * Minimal Deal type used in UI.
 * Reuse our app's Deal type via import to keep a single source of truth.
 */
import type { Deal } from '@/utils/deals';

/** Map a CheapShark deal to our app's Deal. */
function normalizeStoreKey(storeID: string, storeName?: string): string {
  // Map CheapShark store IDs to our canonical keys used across the app
  switch (storeID) {
    case '1':
      return 'steam';
    case '25':
      return 'epic'; // Epic Games Store
    case '11':
      return 'humble'; // Humble Store
    default:
      // Fallback: best-effort based on name (lowercased), else use the id
      const name = (storeName ?? '').toLowerCase();
      if (name.includes('steam')) return 'steam';
      if (name.includes('epic')) return 'epic';
      if (name.includes('humble')) return 'humble';
      if (name.includes('gog')) return 'gog';
      return name || storeID;
  }
}

export function mapDeal(d: CheapSharkDeal, storeName?: string): Deal {
  const platformKey = normalizeStoreKey(d.storeID, storeName);
  // Prefer direct Steam link when we have a steamAppID. For all stores, fall back to the
  // CheapShark redirect which lands on the exact product page for that store.
  let claimLinks: Record<string, string> = {};
  if (d.steamAppID) {
    claimLinks.steam = `https://store.steampowered.com/app/${d.steamAppID}/`;
  }
  // Universal per-deal redirect (works for Epic, Humble, etc.)
  if (d.dealID) {
    claimLinks[platformKey] = `https://www.cheapshark.com/redirect?dealID=${d.dealID}`;
  }

  return {
    title: d.title,
    image: d.thumb,
    listPrice: safeNumber(d.normalPrice),
    currentPrice: safeNumber(d.salePrice),
    // Use normalized platform keys so icons, filters, and claim URLs align.
    platforms: [platformKey],
    dealId: d.dealID,
    gameId: d.gameID,
    steamAppId: d.steamAppID ?? undefined,
    claimLinks: Object.keys(claimLinks).length ? claimLinks : undefined,
    steamRatingPercent: safeNumber(d.steamRatingPercent),
    steamRatingCount: safeNumber(d.steamRatingCount),
    dealRating: safeNumber(d.dealRating),
  };
}

/** Utility: convert stringified numbers to number safely. */
function safeNumber(x: string | number | null | undefined): number {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** Fetch list of stores (cache this for the session). */
let storesCache: CheapSharkStore[] | null = null;
export async function getStores(): Promise<CheapSharkStore[]> {
  if (storesCache) return storesCache;
  const data = await get<CheapSharkStore[]>('stores');
  // Only keep active stores by default
  storesCache = data.filter(s => s.isActive === 1);
  return storesCache;
}

/**
 * Fetch paged deals with optional filters.
 * Common filters: storeID (comma-separated numeric IDs), onSale=1, pageSize, pageNumber, sortBy
 */
export type GetDealsParams = {
  storeID?: string; // e.g., '1,25' for Steam + Epic
  onSale?: 0 | 1;
  lowerPrice?: number;
  upperPrice?: number;
  pageSize?: number; // default 60; we often use 50 for UI
  pageNumber?: number; // 0-based
  sortBy?: 'Deal Rating' | 'Title' | 'Savings' | 'Price' | 'Metacritic' | 'Reviews' | 'Release' | 'Store' | 'recent';
  // Add more from docs as needed: AAA filters, exact store sorting, etc.
};

export async function getDeals(params: GetDealsParams = {}): Promise<CheapSharkDeal[]> {
  // Cheap defaults: only on-sale items, first page, 50 per page
  const merged: Required<GetDealsParams> = {
    onSale: 1,
    pageNumber: 0,
    pageSize: 50,
    sortBy: 'Deal Rating',
    lowerPrice: params.lowerPrice ?? undefined as any,
    upperPrice: params.upperPrice ?? undefined as any,
    storeID: params.storeID ?? undefined as any,
  } as any;
  // Merge loosely while preserving explicit undefined omission
  const finalParams: Record<string, any> = {
    ...(params.storeID ? { storeID: params.storeID } : {}),
    onSale: params.onSale ?? 1,
    ...(params.lowerPrice !== undefined ? { lowerPrice: params.lowerPrice } : {}),
    ...(params.upperPrice !== undefined ? { upperPrice: params.upperPrice } : {}),
    pageSize: params.pageSize ?? 50,
    pageNumber: params.pageNumber ?? 0,
    sortBy: params.sortBy ?? 'Deal Rating',
  };
  return get<CheapSharkDeal[]>('deals', finalParams);
}

/**
 * Convenience: fetch deals and map to our Deal type.
 * Also stitches in human-readable store names for platform badges.
 */
export async function getMappedDeals(params: GetDealsParams = {}): Promise<Deal[]> {
  const [stores, deals] = await Promise.all([getStores(), getDeals(params)]);
  const storeNameById = new Map(stores.map(s => [s.storeID, s.storeName]));
  return deals.map(d => mapDeal(d, storeNameById.get(d.storeID)));
}

/**
 * Suggested usage patterns in UI:
 * - Debounce search inputs (400–600ms) before calling APIs
 * - Cancel previous requests with AbortController when filters change rapidly
 * - Cache getStores() for the session; optionally cache getDeals() by params for a short TTL
 * - Paginate with pageNumber++ when FlatList reaches end
 */
