# Deal classification rules

This document explains how we decide whether a deal is Free, Insane, or Sale.

## Inputs
- `listPrice` (number): The original price of the game, e.g., 59.99
- `currentPrice` (number): The discounted price, e.g., 23.99. Use `0` for free.

From these we derive:
- `discountFraction D = (listPrice − currentPrice) / listPrice` (clamped 0–1)
- `score S = D × log10(P + 1)`, where `P = listPrice`

## Rule
- `free`: `currentPrice <= 0.01`
- `insane`: require both
  - `D >= 0.40` (at least 40% off), and
  - `S >= 1.0` (good balance for $40–$60 titles at ~50–60% off)
- `sale`:
  - default classification for discounts (e.g., `discountPercent >= 15`) if not insane

This balances relative and absolute value:
- Relative: `D` (percent off) must be large enough
- Absolute: `log10(P+1)` grows with original price, boosting high-value titles

### Examples (approximate)
- $60 → $24 (D = 0.60, P = 60)
  - `S = 0.60 × log10(61) ≈ 0.60 × 1.785 = 1.071` → Insane (>= 1.0 and D>=0.40)
- $5 → $2 (D = 0.60, P = 5)
  - `S = 0.60 × log10(6) ≈ 0.60 × 0.778 = 0.467` → Not insane (Sale)

## Tuning knobs
You can adjust these to taste:
- Raise/lower the `D` floor (e.g., require 50% off)
- Raise/lower the `S` threshold (e.g., 0.9 or 1.2)

## Future enhancements
- Price buckets:
  - AAA (>= $40): Insane if discount >= 50% and savings >= $20
  - Mid ($20–$40): Insane if discount >= 60% and savings >= $15
  - Indie (< $20): Insane if discount >= 70% and savings >= $7
- Historical lows: boost score when near all-time low
- Quality signal: bump based on reviews/wishlists

## Implementation
We compute the classification in code at render time so it stays in sync with actual prices:

```ts
function classifyDeal(listPrice: number, currentPrice: number): 'free' | 'insane' | 'sale' {
  if (currentPrice <= 0.01) return 'free';
  if (listPrice <= 0) return 'sale';
  const D = Math.max(0, Math.min(1, (listPrice - currentPrice) / listPrice));
  const S = D * Math.log10(listPrice + 1);
  const insane = D >= 0.40 && S >= 1.0;
  if (insane) return 'insane';
  const discountPercent = Math.round(D * 100);
  if (discountPercent >= 15) return 'sale';
  return 'sale';
}
```
