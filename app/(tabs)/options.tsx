// Options screen: lets the user view and change app settings.
// For now, we manage a single setting: the preferred store for claiming deals.

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, StyleSheet, View, Switch, Modal, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Key we use to store the preferred store in AsyncStorage
const PREFERRED_STORE_KEY = 'preferredStore';

// Simple map of platforms to their web URLs (used for testing the selection)
const STORE_URLS: Record<string, string> = {
  steam: 'https://store.steampowered.com/',
  epic: 'https://store.epicgames.com/',
  gog: 'https://www.gog.com/',
  humble: 'https://www.humblebundle.com/store',
};

// Key for toggling Humble deals visibility in the app.
const INCLUDE_HUMBLE_KEY = 'includeHumble';
// Key for storing selected country/region used for price display
const REGION_COUNTRY_KEY = 'regionCountry';

// A small curated set of regions. We'll wire conversion later; for now this is a preference knob.
// 'auto' means "use device locale".
const REGION_OPTIONS: { code: string; label: string }[] = [
  { code: 'auto', label: 'Auto (device locale)' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'EU', label: 'Eurozone' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'JP', label: 'Japan' },
  { code: 'BR', label: 'Brazil' },
  { code: 'IN', label: 'India' },
];

export default function OptionsScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const STORE_LABELS: Record<string, string> = {
    steam: 'Steam',
    epic: 'Epic Games Store',
    humble: 'Humble Store',
    gog: 'GOG',
  };
  const cardBg = isDark ? '#0f0f0f' : '#fff';
  const cardBorder = isDark ? '#333' : '#ddd';
  const btnBg = isDark ? '#1f1f1f' : '#f5f5f5';
  const btnBorder = isDark ? '#444' : '#ccc';
  const itemBg = btnBg;
  const itemSelectedBg = '#123a5e';
  const itemSelectedText = '#cfe7ff';
  // preferred holds the current choice from storage (or undefined if none yet)
  const [preferred, setPreferred] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  // Whether to include Humble Store deals in listings. Default true.
  const [includeHumble, setIncludeHumble] = useState<boolean>(true);
  // Country/Region selection for price display
  const [region, setRegion] = useState<string>('auto');
  const [regionModalVisible, setRegionModalVisible] = useState<boolean>(false);

  // On first render, read the value from AsyncStorage
  useEffect(() => {
    const load = async () => {
      try {
        const [pref, humble, regionStored] = await Promise.all([
          AsyncStorage.getItem(PREFERRED_STORE_KEY),
          AsyncStorage.getItem(INCLUDE_HUMBLE_KEY),
          AsyncStorage.getItem(REGION_COUNTRY_KEY),
        ]);
        setPreferred(pref ?? undefined);
        setIncludeHumble(humble === null ? true : humble === 'true');
        setRegion(regionStored ?? 'auto');
      } catch (e) {
        console.warn('Failed to read preferred store:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Save a new preferred store and update the UI
  const setPreferredStore = async (platform: string) => {
    try {
      await AsyncStorage.setItem(PREFERRED_STORE_KEY, platform);
      setPreferred(platform);
  const label = STORE_LABELS[platform] ?? platform;
  Alert.alert('Saved', `${label} is now your preferred store.`);
    } catch (e) {
      Alert.alert('Error', 'Could not save your preference.');
    }
  };

  // Clear the preference entirely
  const clearPreferredStore = async () => {
    try {
      await AsyncStorage.removeItem(PREFERRED_STORE_KEY);
      setPreferred(undefined);
      Alert.alert('Cleared', 'Preferred store has been cleared.');
    } catch (e) {
      Alert.alert('Error', 'Could not clear your preference.');
    }
  };

  // Quick test: open the current preferred store in the in-app browser
  const testOpenPreferred = async () => {
    if (!preferred) {
      Alert.alert('No preference set', 'Choose a preferred store first.');
      return;
    }
    const url = STORE_URLS[preferred];
    if (!url) {
      Alert.alert('Unknown platform', `No URL is configured for ${preferred}.`);
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  };

  // Toggle and persist Humble visibility
  const toggleIncludeHumble = async (value: boolean) => {
    try {
      await AsyncStorage.setItem(INCLUDE_HUMBLE_KEY, String(value));
      setIncludeHumble(value);
    } catch (e) {
      Alert.alert('Error', 'Could not save your Humble setting.');
    }
  };

  // Persist region selection
  const saveRegion = async (code: string) => {
    try {
      await AsyncStorage.setItem(REGION_COUNTRY_KEY, code);
      setRegion(code);
      setRegionModalVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Could not save your country/region.');
    }
  };

  const regionLabel = useMemo(() => REGION_OPTIONS.find(r => r.code === region)?.label ?? 'Auto (device locale)', [region]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
      {/* Small header */}
      <ThemedText
        type="title"
        style={{ fontFamily: Fonts.rounded }}
      >
        Settings
      </ThemedText>

      {/* Current status */}
      <ThemedText type="subtitle" style={{ marginTop: 18 }}>Preferred store</ThemedText>
      <ThemedText style={{ opacity: 0.8 }}>
  {loading ? 'Loading…' : preferred ? (STORE_LABELS[preferred] ?? preferred) : 'None set yet'}
      </ThemedText>

      {/* Actions */}
      <ThemedView style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['steam','epic','humble'].map(p => (
            <Pressable
              key={p}
              onPress={() => setPreferredStore(p)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: preferred === p ? '#4da3ff' : btnBorder,
                backgroundColor: preferred === p ? (isDark ? '#0b2a44' : '#eaf4ff') : 'transparent',
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: preferred === p }}
              accessibilityLabel={`Set preferred store to ${STORE_LABELS[p] ?? p}`}
            >
              <ThemedText style={{ fontWeight: '600' }}>{STORE_LABELS[p] ?? (p[0].toUpperCase()+p.slice(1))}</ThemedText>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Pressable
            onPress={clearPreferredStore}
            style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: btnBorder }}
          >
            <ThemedText>Clear</ThemedText>
          </Pressable>
          <Pressable
            onPress={testOpenPreferred}
            style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: btnBorder }}
          >
            <ThemedText>Test open</ThemedText>
          </Pressable>
        </View>
      </ThemedView>

      {/* Humble toggle */}
      <ThemedView style={{ marginTop: 24 }}>
        <ThemedText type="subtitle">Include Humble Store deals</ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <Switch
            value={includeHumble}
            onValueChange={toggleIncludeHumble}
            accessibilityLabel="Toggle Humble Store deals"
          />
          <ThemedText style={{ marginLeft: 12, flex: 1 }}>
            {includeHumble ? 'Humble deals are shown.' : 'Humble deals are hidden.'}
          </ThemedText>
        </View>
        <ThemedText style={{ marginTop: 8 }}>
          Humble runs bundles and publisher promos that behave differently than regular store discounts.
          If you find them less interesting, turn this off to filter them out from the Deals list.
        </ThemedText>
      </ThemedView>

      {/* Country/Region selection */}
      <ThemedView style={{ marginTop: 24 }}>
        <ThemedText type="subtitle">Country / Region</ThemedText>
        <Pressable
          onPress={() => setRegionModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Choose country or region"
          style={{
            marginTop: 8,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: btnBorder,
            backgroundColor: 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <ThemedText>{regionLabel}</ThemedText>
          <Text style={{ color: isDark ? '#9ba1a6' : '#6b7280' }}>›</Text>
        </Pressable>
        <ThemedText style={{ marginTop: 8, opacity: 0.8 }}>
          This helps us format prices for your region. Conversion accuracy will improve over time.
        </ThemedText>
      </ThemedView>

      {/* Help text explaining how this setting is used */}
      <ThemedView style={{ marginTop: 24 }}>
        <ThemedText>
          When you press Claim on a deal with multiple stores, the app will
          use your preferred store automatically if it&apos;s available for that deal.
          Otherwise, you&apos;ll be asked to choose.
        </ThemedText>
      </ThemedView>
  </ScrollView>
    {/* Region modal */}
    <Modal visible={regionModalVisible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <ThemedText type="subtitle">Choose your country/region</ThemedText>
          <ThemedText style={{ marginTop: 6, opacity: 0.9 }}>
            Caution: Costs are directly converted from US prices. Prices may vary.
          </ThemedText>
          <View style={{ marginTop: 12, gap: 8 }}>
            {REGION_OPTIONS.map(opt => (
              <Pressable
                key={opt.code}
                onPress={() => saveRegion(opt.code)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: region === opt.code ? '#4da3ff' : btnBorder,
                  backgroundColor: region === opt.code ? itemSelectedBg : itemBg,
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: region === opt.code }}
                accessibilityLabel={`Select ${opt.label}`}
              >
                <ThemedText style={region === opt.code ? { color: itemSelectedText } : undefined}>{opt.label}</ThemedText>
              </Pressable>
            ))}
          </View>
          <View style={{ marginTop: 12 }}>
            <Button title="Cancel" onPress={() => setRegionModalVisible(false)} />
          </View>
        </View>
      </View>
    </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 12,
    backgroundColor: '#0f0f0f',
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
  },
});
