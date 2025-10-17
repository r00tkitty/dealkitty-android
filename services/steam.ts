import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type SteamPrice = {
  amount: number; // numeric amount in local currency units (e.g., 83)
  currency: string; // ISO-ish currency code from Steam (e.g., INR)
};

// Map Options region to a Steam 'cc' parameter
export const regionToSteamCC: Record<string, string> = {
  auto: 'US',
  US: 'US',
  GB: 'GB',
  EU: 'DE', // pick Germany as representative Euro store
  CA: 'CA',
  AU: 'AU',
  JP: 'JP',
  BR: 'BR',
  IN: 'IN',
};

const CACHE_KEY_PREFIX = 'steam:price:'; // steam:price:{appId}:{cc}
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function getSteamLocalPrice(appId: string, cc: string): Promise<SteamPrice | null> {
  const cacheKey = `${CACHE_KEY_PREFIX}${appId}:${cc}`;
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { savedAt: number; data: SteamPrice };
      if (Date.now() - parsed.savedAt < CACHE_TTL_MS) return parsed.data;
    }
  } catch {}

  if (Platform.OS === 'web') {
    // Steam API does not enable CORS; avoid failing loudly on web
    return null;
  }

  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&cc=${encodeURIComponent(cc)}&filters=price_overview`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    const node = json?.[appId];
    if (!node?.success) return null;
    const price = node.data?.price_overview;
    if (!price) return null;
    // Steam returns 'final' in minor units (e.g., cents). Div by 100.
    const amount = typeof price.final === 'number' ? price.final / 100 : null;
    const currency = typeof price.currency === 'string' ? price.currency : null;
    if (amount == null || currency == null) return null;
    const data: SteamPrice = { amount, currency };
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
    } catch {}
    return data;
  } catch {
    return null;
  }
}
