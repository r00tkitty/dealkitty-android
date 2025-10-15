// Deals screen: shows a list of game deals and lets the user "claim" them.
// Claiming means: open the relevant store (Steam/Epic/GOG). If there are multiple
// stores for a deal, we ask the user which one they prefer with a popup.
// We also remember their preferred store for next time.

import { ScrollView } from "react-native"; // Import ScrollView from React Native
import DealCard from "@/components/DealCard"; // Import the DealCard component
import { useState } from "react";
import { View, Text, Button, Modal, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";


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
  };

  // React "state" = data that can change and should update the UI when it does.
  // - modalVisible: whether the chooser popup is currently shown
  // - platforms: which store options to show in that popup for the selected deal
  const [modalVisible, setModalVisible] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>([]);

  const handleClaim = async (platformsList: string[]) => {
    // 1) If only one platform is available, open it immediately (no need to ask).
    if (platformsList.length == 1) {
      openPlatform(platformsList[0]);
      return;
    }
    // 2) More than one platform: check if the user set a preferred store before.
    // We save and read this from AsyncStorage (a simple on-device key/value store).
    const preferred = await AsyncStorage.getItem("preferredStore");
    if (preferred && platformsList.includes(preferred)) {
      // If preferred exists and is one of the available platforms for this deal, use it.
      openPlatform(preferred);
      return;
    }
    // 3) No preferred match: show the modal so the user can choose.
    setPlatforms(platformsList);
    setModalVisible(true);
  };
  const openPlatform = async (platform: string) => {
    // Turn the platform name (e.g., "steam") into an actual URL.
    const url = STORE_URLS[platform];
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

  // Temporary hard-coded list of deals so we can build the UI.
  // In the future, you might replace this with data from a real API.
  const mockDeals = [
    {
      title: "Celeste",
      image:
        "https://cdn.cloudflare.steamstatic.com/steam/apps/504230/header.jpg",
      price: "Free",
      platforms: ["steam", "epic"],
    },
    {
      title: "Hades",
      image:
        "https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg",
      price: "Free",
      platforms: ["steam", "epic"],
    },
    {
      title: "The Witcher 3: Wild Hunt",
      image:
        "https://cdn.cloudflare.steamstatic.com/steam/apps/292030/header.jpg",
      price: "Free",
      platforms: ["steam", "gog"],
    },
    {
      title: "Cyberpunk 2077",
      image:
        "https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg",
      price: "Free",
      platforms: ["steam", "gog", "epic"],
    },
    {
      title: "Among Us",
      image:
        "https://cdn.cloudflare.steamstatic.com/steam/apps/945360/header.jpg",
      price: "Free",
      platforms: ["steam", "epic"],
    },
    {
      title: "Stardew Valley",
      image:
        "https://cdn.cloudflare.steamstatic.com/steam/apps/413150/header.jpg",
      price: "Free",
      platforms: ["steam", "gog"],
    },
    {
      title: "Doom Eternal",
      image:
        "https://cdn.cloudflare.steamstatic.com/steam/apps/782330/header.jpg",
      price: "Free",
      platforms: ["steam", "epic"],
    },
    {
      title: "Red Dead Redemption 2",
      image:
        "https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/header.jpg",
      price: "Free",
      platforms: ["steam", "gog"],
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* ScrollView lets the list be scrollable when it doesn't fit on screen. */}
      <ScrollView style={{ padding: 10, backgroundColor: "black" }}>
        {mockDeals.map((deal, i) => (
          // For each deal object, render one DealCard.
          // key helps React track each item. Using i (index) is okay for mock data;
          // if you add real data later, prefer a unique id or the title if guaranteed unique.
          <DealCard
            key={i}
            title={deal.title}
            image={deal.image}
            price={deal.price}
            platforms={deal.platforms}
            // When the Claim button in the card is pressed,
            // we pass the card's platforms into handleClaim so it can decide what to do.
            onClaim={handleClaim}
          />
        ))}
      </ScrollView>

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
                  openPlatform(p);
                  setModalVisible(false);
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
                  openPlatform(p);
                  setModalVisible(false);
                }}
              />
            ))}

            {/* Close the popup without doing anything. */}
            <Button title="Cancel" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
