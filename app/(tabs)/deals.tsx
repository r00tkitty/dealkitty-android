// Deals screen: shows a list of game deals and lets the user "claim" them.
// Claiming means: open the relevant store (Steam/Epic/GOG). If there are multiple
// stores for a deal, we ask the user which one they prefer with a popup.
// We also remember their preferred store for next time.

import { FlatList } from "react-native"; // Use FlatList for performance with large lists
import DealCard from "@/components/DealCard"; // Import the DealCard component
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, Button, Modal, Linking, TextInput, Pressable, Alert, Platform, Dimensions } from "react-native";
import { Slider } from "@miblanchard/react-native-slider";
import { SafeAreaView } from "react-native-safe-area-context";
// AsyncStorage is already imported above; keep a single import only.
import * as WebBrowser from "expo-web-browser";
import { classifyDeal, classifyDealWithQuality, computeDealScore, formatPrice, qualityTier, type Deal } from "@/utils/deals";
import { getMappedDeals } from "@/services/cheapshark";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUsdRates, regionToCurrency, convertFromUsd, formatCurrency, type FxRates } from "@/services/fx";
import { getSteamLocalPrice, regionToSteamCC } from "@/services/steam";


// Define the DealsScreen component

export default function DealsScreen() {
  // STORE_URLS is a simple dictionary (lookup table):
  // - you give it a platform key like "steam" and it gives you the URL to open
  // NOTE about Steam: some devices can open steam:// links to jump into the Steam app.
  // If that doesn't work for your device, you can swap to a normal https:// URL instead.
  const STORE_URLS: Record<string, string> = {
    steam: "https://store.steampowered.com/", // try "https://store.steampowered.com/" if steam:// doesn't open on your device
    epic: "https://store.epicgames.com/",
    gog: "https://www.gog.com/",
    humble: "https://www.humblebundle.com/store",
  };

  // Build a best-effort direct store URL without going through CheapShark.
  // Where we have a stable ID (Steam), go straight to the product page.
  // For others, open the store's search results for the title.
  const buildDirectStoreUrl = (platform: string, deal?: Deal): string | undefined => {
    const title = deal?.title?.trim();
    const encoded = title ? encodeURIComponent(title) : undefined;
    switch ((platform || '').toLowerCase()) {
      case 'steam': {
        if (deal?.steamAppId) return `https://store.steampowered.com/app/${deal.steamAppId}/`;
        return encoded ? `https://store.steampowered.com/search/?term=${encoded}` : undefined;
      }
      case 'epic': {
        // Epic product pages require a slug; use search results page as a robust, no-API alternative
        return encoded ? `https://store.epicgames.com/en-US/browse?q=${encoded}` : undefined;
      }
      case 'humble': {
        return encoded ? `https://www.humblebundle.com/store/search?search=${encoded}` : undefined;
      }
      case 'gog': {
        return encoded ? `https://www.gog.com/en/games?query=${encoded}` : undefined;
      }
      default:
        return undefined;
    }
  };

  // React "state" = data that can change and should update the UI when it does.
  // - modalVisible: whether the chooser popup is currently shown
  // - platforms: which store options to show in that popup for the selected deal
  const [modalVisible, setModalVisible] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>([]);
  // Search text the user types into the search bar
  const [searchText, setSearchText] = useState("");
  // Which platform filters are active. If none selected, we show all.
  // We use a Set for easy add/remove checks; remember to create a new Set on updates.
  const [platformFilters, setPlatformFilters] = useState<Set<string>>(new Set());
  // Whether the platform dropdown panel is open
  const [showPlatformMenu, setShowPlatformMenu] = useState(false);
  // Deal type filter: 'all' | 'free' | 'insane' | 'sale'
  const [dealType, setDealType] = useState<'all' | 'free' | 'insane' | 'sale'>('all');
  // Read user setting to optionally exclude Humble Store from listings
  const [includeHumble, setIncludeHumble] = useState<boolean>(true);
  // Price band buttons removed; use slider-based ranges only
  // Sort mode to prioritize AAA (quality) vs discount vs price
  type SortMode = 'quality' | 'discount' | 'price-low' | 'price-high';
  const [sortMode, setSortMode] = useState<SortMode>('quality');
  const listRef = useRef<FlatList<Deal>>(null);
  // Slider-based ranges for original (list) and sale (current) prices
  const [listRange, setListRange] = useState<[number, number] | null>(null);
  const [saleRange, setSaleRange] = useState<[number, number] | null>(null);
  // Region + FX
  const [region, setRegion] = useState<string>('auto');
  const [currency, setCurrency] = useState<string>('USD');
  const [fx, setFx] = useState<FxRates | null>(null);
  useEffect(() => {
    // Give UI a tick to render then scroll to top on sort change
    const id = setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 0);
    return () => clearTimeout(id);
  }, [sortMode]);

  // Load region and FX rates on mount
  useEffect(() => {
    (async () => {
      try {
        const r = (await AsyncStorage.getItem('regionCountry')) ?? 'auto';
        setRegion(r);
        const cur = regionToCurrency[r] ?? 'USD';
        setCurrency(cur);
      } catch {}
      try {
        const rates = await getUsdRates();
        setFx(rates);
      } catch {}
    })();
  }, []);

  const handleClaim = async (deal: Deal) => {
    const platformsList = includeHumble ? deal.platforms : deal.platforms.filter(p => p.toLowerCase() !== 'humble');
    // 1) If only one platform is available, open it immediately (no need to ask).
    if (platformsList.length == 1) {
      openPlatform(platformsList[0], deal);
      return;
    }
    // 2) More than one platform: check if the user set a preferred store before.
    // We save and read this from AsyncStorage (a simple on-device key/value store).
    const preferred = await AsyncStorage.getItem("preferredStore");
    if (preferred && platformsList.includes(preferred)) {
      // If preferred exists and is one of the available platforms for this deal, use it.
      openPlatform(preferred, deal);
      return;
    }
    // 3) No preferred match: show the modal so the user can choose.
    setPlatforms(platformsList);
    setSelectedDeal(deal);
    setModalVisible(true);
  };
  const openPlatform = async (platform: string, deal?: Deal) => {
    // Turn the platform name (e.g., "steam") into an actual URL.
    // Prefer direct store product/search URL, then per-game link (from API), then store home.
    const direct = buildDirectStoreUrl(platform, deal);
    const perGame = deal?.claimLinks?.[platform];
    const url = direct || perGame || STORE_URLS[platform];
    if (!url) {
      // Defensive check: if we don't have a URL for some reason, stop here.
      console.log(`No URL found for platform: ${platform}`);
      return;
    }
    try {
      // For normal web links, Expo's in-app browser is reliable across platforms.
      if (url.startsWith("http")) {
        console.log(`Opening in in-app browser: ${url}`);
        await WebBrowser.openBrowserAsync(url);
        console.log(`Opened platform: ${platform}`);
        return;
      }

      // For custom schemes (like steam://), try Linking and note that on iOS/Android
      // you may need additional app configuration for canOpenURL to return true.
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        console.log(`Opening via Linking: ${url}`);
        await Linking.openURL(url);
        console.log(`Opened platform: ${platform}`);
      } else {
        console.warn(`Cannot open URL (scheme not supported?): ${url}`);
      }
    } catch (err) {
      // If anything unexpected happens (rare), we catch it to avoid crashing the app.
      console.error(`Error opening URL ${url}:`, err);
    }

  };
  const setPreferredStore = async (platform: string) => {
    // Save the user's preferred platform for later. Next time, we'll auto-open it.
    await AsyncStorage.setItem("preferredStore", platform);
  };

  // Live data state: deals, paging, loading, errors
  const [deals, setDeals] = useState<Deal[]>([]);
  const [page, setPage] = useState(0); // 0-based pageNumber as CheapShark expects
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  // Tiny fallback dataset used only on web when network calls are blocked by CORS,
  // so the UI still demonstrates behavior.
  const FALLBACK: Deal[] = [
    { title: 'Fallback: Hades', image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg', listPrice: 24.99, currentPrice: 9.99, platforms: ['steam', 'epic'] },
    { title: 'Fallback: Celeste', image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/header.jpg', listPrice: 19.99, currentPrice: 0, platforms: ['steam'] },
    { title: 'Fallback: Cyberpunk 2077', image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg', listPrice: 59.99, currentPrice: 29.99, platforms: ['steam', includeHumble ? 'humble' : 'steam'] },
  ];

  // Debounce search to avoid firing a network call on every keystroke.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the storeID parameter based on defaults + settings.
  // CheapShark store IDs: Steam=1, Epic=25, Humble=11.
  const storeIDParam = useMemo(() => {
    const ids = [1, 25]; // Steam + Epic by default
    if (includeHumble) ids.push(11);
    return ids.join(',');
  }, [includeHumble]);

  // Compute a stable game key to merge the same game from multiple stores.
  const gameKey = (d: Deal): string => {
    if (d.steamAppId) return `steamapp:${d.steamAppId}`;
    if (d.gameId) return `cheapshark:${d.gameId}`;
    // Fallback: normalized title (lowercased, trimmed, basic cleanup)
    const norm = d.title
      .toLowerCase()
      .replace(/[®™]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return `title:${norm}`;
  };

  // Merge deals by game key: union platforms and claim links; pick the best (lowest) current price.
  const mergeDealsByGame = (list: Deal[]): Deal[] => {
    const map = new Map<string, Deal>();
    for (const d of list) {
      const key = gameKey(d);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          ...d,
          platforms: Array.from(new Set(d.platforms)),
          claimLinks: d.claimLinks ? { ...d.claimLinks } : undefined,
        });
      } else {
        // Combine platforms
        const combinedPlatforms = Array.from(new Set([...(existing.platforms || []), ...(d.platforms || [])]));
        // Combine claim links
        const combinedLinks = { ...(existing.claimLinks || {}) , ...(d.claimLinks || {}) } as Record<string, string>;
        // Choose the better price entry (lower currentPrice wins)
        const best = (d.currentPrice < existing.currentPrice) ? d : existing;
        map.set(key, {
          ...best,
          platforms: combinedPlatforms,
          claimLinks: Object.keys(combinedLinks).length ? combinedLinks : undefined,
          // Keep strongest available quality metrics
          steamRatingPercent: Math.max(existing.steamRatingPercent ?? 0, d.steamRatingPercent ?? 0) || best.steamRatingPercent,
          steamRatingCount: Math.max(existing.steamRatingCount ?? 0, d.steamRatingCount ?? 0) || best.steamRatingCount,
          dealRating: Math.max(existing.dealRating ?? 0, d.dealRating ?? 0) || best.dealRating,
        });
      }
    }
    return Array.from(map.values());
  };

  // A helper to actually fetch a page of deals and map them.
  // Wrapped so we can reuse for initial load, refresh, and pagination.
  const fetchPage = async (pageNumber: number, replace: boolean) => {
    try {
      setError(null);
      const result = await getMappedDeals({ storeID: storeIDParam, onSale: 1, pageNumber, pageSize: 50 });
      // Do not drop multi-store deals here; we already control inclusion via storeIDParam.
      // Leave Humble filtering to the UI layer so multi-store games are preserved.
      setDeals(prev => mergeDealsByGame(replace ? result : [...prev, ...result]));
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to load deals';
      setError(msg);
      if (Platform.OS === 'web') {
        // Provide a small fallback so users see the UI even with CORS limitations
        setDeals(mergeDealsByGame(FALLBACK));
      }
    }
  };

  // Initial load + whenever includeHumble or store defaults change
  useEffect(() => {
    // Reset list to page 0
    setDeals([]);
    setPage(0);
    fetchPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeIDParam]);

  // Debounced search: when searchText changes, wait a bit, then reload from page 0
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      // For CheapShark, a proper title search would use /games or /deals with title params.
      // To keep this example simple, we keep client-side filter for now.
      // If we later move to server-side search, call fetchPage(0, true) here with title param.
      setPage(0);
    }, 500);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchText]);

  // When sort mode changes, scroll the list to top so the new order is obvious
  useEffect(() => {
    try {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    } catch {}
  }, [sortMode]);

  // Load the Humble toggle at mount time so the UI respects the setting.
  // Note: we keep it simple here; a settings context could also be used.
  useEffect(() => {
    (async () => {
      try {
        const val = await AsyncStorage.getItem('includeHumble');
        setIncludeHumble(val === null ? true : val === 'true');
      } catch (e) {
        // default stays true
      }
    })();
  }, []);

  // Also refresh the Humble setting whenever this screen/tab gains focus.
  // This makes the toggle in Options take effect without restarting the app.
  useFocusEffect(
    useCallback(() => {
      let canceled = false;
      (async () => {
        try {
          const val = await AsyncStorage.getItem('includeHumble');
          if (!canceled) setIncludeHumble(val === null ? true : val === 'true');
        } catch {}
      })();
      return () => {
        canceled = true;
      };
    }, [])
  );

  // Compute which deals should be visible based on the search and filters
  const normalizedQuery = searchText.trim().toLowerCase();
  // Dynamic max bounds for sliders based on loaded data
  const { maxListPrice, maxSalePrice } = useMemo(() => {
    const maxList = Math.max(0, ...deals.map((d) => d.listPrice), 100);
    const maxSale = Math.max(0, ...deals.map((d) => d.currentPrice), 100);
    return { maxListPrice: Math.ceil(maxList), maxSalePrice: Math.ceil(maxSale) };
  }, [deals]);
  // Initialize sliders to full range once data is available
  useEffect(() => {
    if (!listRange) setListRange([0, maxListPrice]);
    if (!saleRange) setSaleRange([0, maxSalePrice]);
  }, [maxListPrice, maxSalePrice]);

  // Local currency helpers
  const toLocal = useCallback((usd: number) => convertFromUsd(usd, currency, fx), [currency, fx]);
  const fmtLocal = useCallback((usd: number) => formatCurrency(toLocal(usd), currency), [toLocal, currency]);

  const visibleDeals = deals.filter((deal) => {
    // 1) Search filter: match title substring (case-insensitive)
    const matchesSearch =
      normalizedQuery.length === 0 || deal.title.toLowerCase().includes(normalizedQuery);
    // 2) Platform filter: if no platform is selected, accept all.
    //    If some are selected, the deal must include at least one of them.
    const noPlatformFilters = platformFilters.size === 0;
  // If Humble is disabled, keep the card but drop Humble from platform matching
  const platformsEffective = includeHumble ? deal.platforms : deal.platforms.filter(p => p.toLowerCase() !== 'humble');
    const matchesPlatform = noPlatformFilters || platformsEffective.some((p) => platformFilters.has(p));
    // 3) Deal type filter: compute the type on the fly
    const computedType = classifyDeal(deal.listPrice, deal.currentPrice);
    const matchesType = dealType === 'all' ? true : computedType === dealType;
    // 4) Respect Humble toggle: if disabled, hide Humble-only deals or remove Humble from multi-store
  // If Humble was the only platform and it's disabled, drop the deal entirely
  // Do not hide multi-store cards when Humble is disabled; only hide if Humble was the ONLY platform
  const notHiddenByHumble = includeHumble || platformsEffective.length > 0;
    // Slider range filters (original and sale prices)
    const withinList = !listRange || (deal.listPrice >= listRange[0] && deal.listPrice <= listRange[1]);
    const withinSale = !saleRange || (deal.currentPrice >= saleRange[0] && deal.currentPrice <= saleRange[1]);
    return matchesSearch && matchesPlatform && matchesType && notHiddenByHumble && withinList && withinSale;
  });

  // Sorting helpers
  const qualityRank = (d: Deal) => {
    const q = qualityTier(d);
    return q === 'great' ? 2 : q === 'good' ? 1 : 0;
  };
  const cmpNumberDesc = (a: number, b: number) => (a === b ? 0 : a > b ? -1 : 1);
  const cmpNumberAsc = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);

  // Apply sorting based on selected mode
  const sortedDeals = useMemo(() => {
    const arr = [...visibleDeals];
    arr.sort((a, b) => {
      const sa = computeDealScore(a.listPrice, a.currentPrice);
      const sb = computeDealScore(b.listPrice, b.currentPrice);
      switch (sortMode) {
        case 'quality': {
          const qr = cmpNumberDesc(qualityRank(a), qualityRank(b));
          if (qr !== 0) return qr;
          const scoreCmp = cmpNumberDesc(sa.score, sb.score);
          if (scoreCmp !== 0) return scoreCmp;
          const drCmp = cmpNumberDesc(a.dealRating ?? 0, b.dealRating ?? 0);
          if (drCmp !== 0) return drCmp;
          const priceCmp = cmpNumberAsc(a.currentPrice, b.currentPrice);
          if (priceCmp !== 0) return priceCmp;
          return a.title.localeCompare(b.title);
        }
        case 'discount': {
          const scoreCmp = cmpNumberDesc(sa.score, sb.score);
          if (scoreCmp !== 0) return scoreCmp;
          const pctCmp = cmpNumberDesc(sa.discountPercent, sb.discountPercent);
          if (pctCmp !== 0) return pctCmp;
          const saveCmp = cmpNumberDesc(sa.savings, sb.savings);
          if (saveCmp !== 0) return saveCmp;
          // Prefer lower price when discount metrics tie
          const priceCmp = cmpNumberAsc(a.currentPrice, b.currentPrice);
          if (priceCmp !== 0) return priceCmp;
          return a.title.localeCompare(b.title);
        }
        case 'price-low': {
          const priceCmp = cmpNumberAsc(a.currentPrice, b.currentPrice);
          if (priceCmp !== 0) return priceCmp;
          const scoreCmp = cmpNumberDesc(sa.score, sb.score);
          if (scoreCmp !== 0) return scoreCmp;
          const qr = cmpNumberDesc(qualityRank(a), qualityRank(b));
          if (qr !== 0) return qr;
          return a.title.localeCompare(b.title);
        }
        case 'price-high':
        default: {
          const priceCmp = cmpNumberDesc(a.currentPrice, b.currentPrice);
          if (priceCmp !== 0) return priceCmp;
          const scoreCmp = cmpNumberDesc(sa.score, sb.score);
          if (scoreCmp !== 0) return scoreCmp;
          const qr = cmpNumberDesc(qualityRank(a), qualityRank(b));
          if (qr !== 0) return qr;
          return a.title.localeCompare(b.title);
        }
      }
    });
    return arr;
  }, [visibleDeals, sortMode]);

  // Helper to toggle a platform filter on/off
  const togglePlatform = (platform: string) => {
    setPlatformFilters((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  // Quick reset for filters/search
  const clearFilters = () => {
    setSearchText("");
    setPlatformFilters(new Set());
  };

  return (
    // SafeAreaView ensures content does not sit under the system status bar/notch.
    // This is especially important because Android edge-to-edge is enabled in app.json.
    <SafeAreaView style={{ flex: 1, backgroundColor: "black" }}>
      {/*
        FILTER BAR
        - Text input to search by title (simple substring match)
        - Platform toggles to include Steam/Epic/GOG. If none are selected, we show everything.
      */}
  <View style={{ paddingHorizontal: 10, paddingTop: 10, backgroundColor: "black" }}>
        {/* Search box */}
        <TextInput
          placeholder="Search games…"
          placeholderTextColor="#999"
          value={searchText}
          onChangeText={setSearchText}
          style={{
            backgroundColor: "#1f1f1f",
            color: "#fff",
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#333",
            marginBottom: 8,
          }}
          accessibilityLabel="Search games"
          accessibilityRole="search"
          returnKeyType="search"
        />

        {/* Filter controls */}
  <View style={{ gap: 8, marginBottom: 8 }}>
          {/* Deal type segmented control */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'free', label: 'Free' },
              { key: 'insane', label: 'Insane' },
              { key: 'sale', label: 'Sale' },
            ].map(({ key, label }) => {
              const selected = dealType === (key as any);
              return (
                <Pressable
                  key={key}
                  onPress={() => setDealType(key as any)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: selected ? '#4da3ff' : '#444',
                    backgroundColor: selected ? '#123a5e' : '#1f1f1f',
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Filter: ${label}`}
                >
                  <Text style={{ color: selected ? '#cfe7ff' : '#eee' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* One row: Platforms, Price, Sort (in this order). Clear remains optional at end. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
              <Pressable
                onPress={() => setShowPlatformMenu((s) => !s)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: '#444',
                  backgroundColor: '#1f1f1f',
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: showPlatformMenu }}
                accessibilityLabel="Choose platforms"
              >
                <Text style={{ color: '#eee' }}>
                  Platforms {platformFilters.size > 0 ? `(${platformFilters.size})` : '(all)'} ▾
                </Text>
              </Pressable>
              {showPlatformMenu && (
                <View
                  style={{
                    position: 'absolute',
                    top: 42,
                    left: 0,
                    right: undefined,
                    backgroundColor: '#111',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#333',
                    padding: 12,
                    gap: 8,
                    minWidth: '100%',
                    zIndex: 1000,
                    elevation: 8,
                  }}
                  accessibilityRole="menu"
                >
                  {['steam','epic','humble'].map((p) => {
                    const selected = platformFilters.has(p);
                    return (
                      <Pressable
                        key={p}
                        onPress={() => togglePlatform(p)}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={`Include ${p}`}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 3,
                            borderWidth: 2,
                            borderColor: selected ? '#4da3ff' : '#666',
                            backgroundColor: selected ? '#123a5e' : 'transparent',
                            marginRight: 10,
                          }}
                        />
                        <Text style={{ color: '#eee', fontSize: 16 }}>{p}</Text>
                      </Pressable>
                    );
                  })}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <Pressable
                      onPress={() => setShowPlatformMenu(false)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#444',
                        backgroundColor: '#1f1f1f',
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Close platform menu"
                    >
                      <Text style={{ color: '#eee' }}>Done</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPlatformFilters(new Set())}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#444',
                        backgroundColor: '#1f1f1f',
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Clear selected platforms"
                    >
                      <Text style={{ color: '#eee' }}>Clear</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            {/* Price dropdown */}
            <PriceFilter
              listRange={listRange ?? [0, maxListPrice]}
              onChangeListRange={setListRange}
              saleRange={saleRange ?? [0, maxSalePrice]}
              onChangeSaleRange={setSaleRange}
              maxList={maxListPrice}
              maxSale={maxSalePrice}
              currency={currency}
              toLocal={toLocal}
            />

            {/* Sort dropdown */}
            <SortDropdown sortMode={sortMode} onChange={setSortMode} />

            {(platformFilters.size > 0 || searchText.trim().length > 0 || dealType !== 'all') && (
              <Pressable
                onPress={clearFilters}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: '#444',
                  backgroundColor: '#1f1f1f',
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear filters"
              >
                <Text style={{ color: '#eee' }}>Clear</Text>
              </Pressable>
            )}
          </View>

          {/* Removed sibling overlay; panel is nested under trigger now to avoid layout jank */}
        </View>
      </View>

      {/* Error banner (e.g., CORS on web or network issue) */}
      {error && (
        <View style={{ backgroundColor: '#5c1717', padding: 10 }}>
          <Text style={{ color: '#ffdddd' }}>{error}</Text>
        </View>
      )}

      {/* FlatList efficiently renders large lists and supports pull-to-refresh and pagination. */}
      <FlatList
        ref={listRef}
        contentContainerStyle={{ padding: 10, backgroundColor: 'black' }}
        data={sortedDeals}
        keyExtractor={(item) => {
          // Use the same identity logic as merge: steamAppId > gameId > normalized title
          if (item.steamAppId) return `steamapp:${item.steamAppId}`;
          if (item.gameId) return `cheapshark:${item.gameId}`;
          const norm = item.title.toLowerCase().replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
          return `title:${norm}`;
        }}
        extraData={sortMode}
        renderItem={({ item }) => (
          <LocalizedDealItem
            item={item}
            includeHumble={includeHumble}
            currency={currency}
            region={region}
            toLocal={toLocal}
            onClaim={handleClaim}
          />
        )}
        ListEmptyComponent={
          <View style={{ paddingVertical: 20 }}>
            <Text style={{ color: '#ccc' }}>
              {error ? 'Unable to load deals.' : 'No deals match your search or filters.'}
            </Text>
            {!error && (
              <Text style={{ color: '#666', marginTop: 6 }}>
                Tip: First load may take a moment. Pull down to refresh.
              </Text>
            )}
          </View>
        }
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await fetchPage(0, true);
          setPage(0);
          setRefreshing(false);
        }}
        onEndReachedThreshold={0.5}
        onEndReached={async () => {
          if (loadingMore || sortedDeals.length === 0) return;
          setLoadingMore(true);
          const next = page + 1;
          await fetchPage(next, false);
          setPage(next);
          setLoadingMore(false);
        }}
        ListFooterComponent={loadingMore ? (
          <Text style={{ color: '#888', textAlign: 'center', paddingVertical: 12 }}>Loading more…</Text>
        ) : null}
      />

      {/* Modal: a simple popup that appears above the screen content. */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              padding: 20,
              borderRadius: 10,
              width: "80%",
            }}
          >
            <Text style={{ fontSize: 18, marginBottom: 10 }}>
              This sale is available on multiple platforms:
            </Text>

            {platforms.map((p) => (
              <Button
                key={p}
                title={`Claim on ${p}`}
                onPress={() => {
                  // Open the selected platform and then close the modal.
                  openPlatform(p, selectedDeal ?? undefined);
                  setModalVisible(false);
                  // keep state minimal
                }}
              />
            ))}

            {platforms.map((p) => (
              <Button
                key={p + "-pref"}
                title={`Set ${p} as preferred and claim`}
                onPress={async () => {
                  // Save this platform as the user's preference for next time,

                  // then immediately open it.
                  await setPreferredStore(p);
                  openPlatform(p, selectedDeal ?? undefined);
                  setModalVisible(false);
                }}
              />
            ))}

            {/* Close the popup without doing anything. */}
            <Button title="Cancel" onPress={() => { setModalVisible(false); }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Lightweight inline dropdown for price filters to declutter the toolbar.
function LocalizedDealItem({ item, includeHumble, currency, region, toLocal, onClaim }: {
  item: Deal;
  includeHumble: boolean;
  currency: string;
  region: string;
  toLocal: (usd: number) => number;
  onClaim: (d: Deal) => void;
}) {
  const list = item.listPrice;
  const cur = item.currentPrice;
  const pctRaw = list && list > 0 ? ((list - cur) / list) * 100 : undefined;
  const pct = pctRaw && pctRaw > 0 ? Math.round(pctRaw) : undefined;
  const defaultSuffix = currency !== 'USD' && cur > 0.01
    ? `≈ ${formatCurrency(toLocal(cur), currency).replace(/\s/g, '')}`
    : undefined;
  const cc = regionToSteamCC[region] ?? 'US';
  const [localExact, setLocalExact] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!item.steamAppId || cur <= 0.01) return;
      const p = await getSteamLocalPrice(String(item.steamAppId), cc);
      if (cancelled) return;
      if (p && p.amount > 0) {
        setLocalExact(`${formatCurrency(p.amount, p.currency).replace(/\s/g, '')}`);
      } else {
        setLocalExact(undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [item.steamAppId, cc, cur]);

  const localDisplay = localExact ? localExact : defaultSuffix;
  const localKind = localExact ? 'exact' : (defaultSuffix ? 'approx' : undefined);
  return (
    <DealCard
      title={item.title}
      image={item.image}
      price={cur <= 0.01 ? 'Free' : `$${cur.toFixed(2)}`}
      localApprox={localDisplay}
      localKind={localKind as any}
      discountPct={pct}
      platforms={includeHumble ? item.platforms : item.platforms.filter((p: string) => p.toLowerCase() !== 'humble')}
      dealType={classifyDealWithQuality(item)}
      onClaim={() => onClaim(item)}
    />
  );
}

// Lightweight inline dropdown for price filters to declutter the toolbar.
function PriceFilter({
  listRange,
  onChangeListRange,
  saleRange,
  onChangeSaleRange,
  maxList,
  maxSale,
  currency,
  toLocal,
}: {
  listRange: [number, number];
  onChangeListRange: (r: [number, number]) => void;
  saleRange: [number, number];
  onChangeSaleRange: (r: [number, number]) => void;
  maxList: number;
  maxSale: number;
  currency: string;
  toLocal: (usd: number) => number;
}) {
  const [open, setOpen] = useState(false);
  const screenWidth = Dimensions.get('window').width;
  // Full-width panel with side margins, centered to screen
  const sideMargin = 10;
  const panelWidth = Math.max(220, screenWidth - sideMargin * 2);
  // Measure trigger position to avoid off-screen overflow (left or right)
  const triggerWrapRef = useRef<View>(null);
  const [leftOffset, setLeftOffset] = useState(0);

  useEffect(() => {
    if (!open) return;
    // Wait a tick to ensure layout is ready before measuring
    const id = setTimeout(() => {
      triggerWrapRef.current?.measureInWindow?.((x: number) => {
        // Position the panel so its left aligns to screen side margin, regardless of trigger X
        setLeftOffset(sideMargin - x);
      });
    }, 0);
    return () => clearTimeout(id);
  }, [open, panelWidth, sideMargin]);
  return (
    <View ref={triggerWrapRef} style={{ position: 'relative', alignSelf: 'flex-start' }}>
      <Pressable
        onPress={() => setOpen((s) => !s)}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#444',
          backgroundColor: '#1f1f1f',
          alignSelf: 'flex-start',
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Price filters"
      >
        <Text style={{ color: '#eee' }}>Price ▾</Text>
      </Pressable>
      {open && (
        <View style={{
          position: 'absolute',
          top: 42,
          left: leftOffset,
          right: undefined,
          backgroundColor: '#111',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#333',
          padding: 12,
          gap: 8,
          // Span nearly full width with side margins
          width: panelWidth,
          zIndex: 1000,
          elevation: 8,
        }}>
          {/* Backdrop to close on outside tap (small hitbox above panel) */}
          <Pressable onPress={() => setOpen(false)} style={{ position: 'absolute', top: -42, left: 0, right: 0, height: 42, opacity: 0 }} accessibilityLabel="Close price dropdown" />
          {/* Double-thumb sliders for original and sale price */}
          <View style={{ marginTop: 8, gap: 6 }}>
            <Text style={{ color: '#bbb', fontVariant: ['tabular-nums'] }}>Original price range: {currency !== 'USD' ? '≈ ' : ''}{currency === 'USD' ? `$${listRange[0]} – $${listRange[1]} (max $${maxList})` : `${toLocal(listRange[0]).toFixed(currency === 'JPY' ? 0 : 0)} – ${toLocal(listRange[1]).toFixed(currency === 'JPY' ? 0 : 0)} (max ${toLocal(maxList).toFixed(currency === 'JPY' ? 0 : 0)})`}</Text>
            <Slider
              value={listRange}
              onValueChange={(v: any) => onChangeListRange([Math.round(v[0]), Math.round(v[1])])}
              minimumValue={0}
              maximumValue={Math.max(10, maxList)}
              step={1}
              minimumTrackTintColor="#4da3ff"
              thumbTintColor="#cfe7ff"
            />
          </View>
          <View style={{ marginTop: 8, gap: 6 }}>
            <Text style={{ color: '#bbb', fontVariant: ['tabular-nums'] }}>Sale price range: {currency !== 'USD' ? '≈ ' : ''}{currency === 'USD' ? `$${saleRange[0]} – $${saleRange[1]} (max $${maxSale})` : `${toLocal(saleRange[0]).toFixed(currency === 'JPY' ? 0 : 0)} – ${toLocal(saleRange[1]).toFixed(currency === 'JPY' ? 0 : 0)} (max ${toLocal(maxSale).toFixed(currency === 'JPY' ? 0 : 0)})`}</Text>
            <Slider
              value={saleRange}
              onValueChange={(v: any) => onChangeSaleRange([Math.round(v[0]), Math.round(v[1])])}
              minimumValue={0}
              maximumValue={Math.max(10, maxSale)}
              step={1}
              minimumTrackTintColor="#4da3ff"
              thumbTintColor="#cfe7ff"
            />
          </View>
        </View>
      )}
    </View>
  );
}

// Compact Sort dropdown used in the toolbar
function SortDropdown({ sortMode, onChange }: { sortMode: 'quality' | 'discount' | 'price-low' | 'price-high'; onChange: (m: 'quality' | 'discount' | 'price-low' | 'price-high') => void }) {
  const [open, setOpen] = useState(false);
  const labelMap: Record<'quality' | 'discount' | 'price-low' | 'price-high', string> = {
    'quality': 'Quality',
    'discount': 'Discount',
    'price-low': '$ low',
    'price-high': '$ high',
  };
  return (
    <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
      <Pressable
        onPress={() => setOpen((s) => !s)}
        style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#444', backgroundColor: '#1f1f1f', alignSelf: 'flex-start' }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Sort by"
      >
        <Text style={{ color: '#eee' }}>Sort: {labelMap[sortMode]} ▾</Text>
      </Pressable>
      {open && (
        <View style={{ position: 'absolute', top: 42, left: 0, right: undefined, backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 12, gap: 8, zIndex: 1000, elevation: 8 }}>
          {/* Backdrop strip above to close, mirrors Price dropdown behavior */}
          <Pressable onPress={() => setOpen(false)} style={{ position: 'absolute', top: -42, left: 0, right: 0, height: 42, opacity: 0 }} accessibilityLabel="Close sort dropdown" />
          {([
            { key: 'quality', label: 'Quality' },
            { key: 'discount', label: 'Discount' },
            { key: 'price-low', label: '$ low' },
            { key: 'price-high', label: '$ high' },
          ] as const).map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => { onChange(key); setOpen(false); }}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: sortMode === key ? '#4da3ff' : '#444', backgroundColor: sortMode === key ? '#123a5e' : '#1f1f1f' }}
              accessibilityRole="button"
              accessibilityState={{ selected: sortMode === key }}
              accessibilityLabel={`Sort: ${label}`}
            >
              <Text style={{ color: sortMode === key ? '#cfe7ff' : '#eee' }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
