// Options screen: lets the user view and change app settings.
// For now, we manage a single setting: the preferred store for claiming deals.

import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';

// Key we use to store the preferred store in AsyncStorage
const PREFERRED_STORE_KEY = 'preferredStore';

// Simple map of platforms to their web URLs (used for testing the selection)
const STORE_URLS: Record<string, string> = {
  steam: 'https://store.steampowered.com/',
  epic: 'https://store.epicgames.com/',
  gog: 'https://www.gog.com/',
};

export default function OptionsScreen() {
  // preferred holds the current choice from storage (or undefined if none yet)
  const [preferred, setPreferred] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // On first render, read the value from AsyncStorage
  useEffect(() => {
    const load = async () => {
      try {
        const value = await AsyncStorage.getItem(PREFERRED_STORE_KEY);
        setPreferred(value ?? undefined);
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
      Alert.alert('Saved', `${platform} is now your preferred store.`);
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

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="gearshape"
          style={styles.headerImage}
        />
      }>
      {/* Title */}
      <ThemedView style={styles.titleContainer}>
        <ThemedText
          type="title"
          style={{
            fontFamily: Fonts.rounded,
          }}>
          Options
        </ThemedText>
      </ThemedView>

      {/* Current status */}
      <ThemedText type="subtitle" style={{ marginTop: 8 }}>Preferred store</ThemedText>
      <ThemedText>
        {loading ? 'Loading…' : preferred ? preferred : 'None set yet'}
      </ThemedText>

      {/* Actions */}
      <ThemedView style={{ marginTop: 16, gap: 8 }}>
        <ThemedText type="subtitle">Set preferred to:</ThemedText>
        <View style={styles.row}>
          <Button title="Steam" onPress={() => setPreferredStore('steam')} />
          <Button title="Epic" onPress={() => setPreferredStore('epic')} />
          <Button title="GOG" onPress={() => setPreferredStore('gog')} />
        </View>
        <Button title="Clear preferred" onPress={clearPreferredStore} />
        <Button title="Test open preferred" onPress={testOpenPreferred} />
      </ThemedView>

      {/* Help text explaining how this setting is used */}
      <ThemedView style={{ marginTop: 24 }}>
        <ThemedText>
          When you press Claim on a deal with multiple stores, the app will
          use your preferred store automatically if it&apos;s available for that deal.
          Otherwise, you&apos;ll be asked to choose.
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
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
});
