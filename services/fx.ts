import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key for cached USD rates
const FX_CACHE_KEY = 'fx:USD:rates';
// Cache TTL in milliseconds (24h)
const FX_TTL_MS = 24 * 60 * 60 * 1000;

export type FxRates = {
  base: 'USD';
  date: string; // ISO date string
  rates: Record<string, number>; // currency -> rate (1 USD -> X currency)
};

// Minimal mapping from Options region code to currency code
export const regionToCurrency: Record<string, string> = {
  auto: 'USD',
  US: 'USD',
  GB: 'GBP',
  EU: 'EUR',
  CA: 'CAD',
  AU: 'AUD',
  JP: 'JPY',
  BR: 'BRL',
  IN: 'INR',
};

export const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'CA$',
  AUD: 'A$',
  JPY: '¥',
  BRL: 'R$',
  INR: '₹',
};

// Fallback rates in case the network fails, rough and periodically update-worthy
const FALLBACK_RATES: FxRates = {
  base: 'USD',
  date: '2025-01-01',
  rates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.78,
    CAD: 1.35,
    AUD: 1.50,
    JPY: 150,
    BRL: 5.2,
    INR: 83,
  },
};

// Fetch USD-based rates from a public API, with cache
export async function getUsdRates(): Promise<FxRates> {
  try {
    const cachedRaw = await AsyncStorage.getItem(FX_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as { savedAt: number; data: FxRates };
      if (Date.now() - cached.savedAt < FX_TTL_MS) {
        return cached.data;
      }
    }
  } catch {}

  try {
    // Open Exchange Rates alternative endpoints without API key
    // Using open.er-api.com (no key) as a simple source
    const resp = await fetch('https://open.er-api.com/v6/latest/USD');
    if (resp.ok) {
      const json = await resp.json();
      const data: FxRates = {
        base: 'USD',
        date: new Date(json.time_last_update_utc ?? Date.now()).toISOString(),
        rates: json.rates,
      };
      try {
        await AsyncStorage.setItem(FX_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
      } catch {}
      return data;
    }
  } catch {}

  // Fallback if fetch fails
  return FALLBACK_RATES;
}

export function convertFromUsd(amountUsd: number, currency: string, rates: FxRates | null): number {
  if (!rates) return amountUsd; // no rates, assume USD
  const rate = rates.rates[currency] ?? 1;
  return amountUsd * rate;
}

export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
      minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    }).format(amount);
  } catch {
    const symbol = currencySymbols[currency] ?? '';
    const rounded = currency === 'JPY' ? Math.round(amount).toString() : amount.toFixed(2);
    return `${symbol}${rounded}`;
  }
}
