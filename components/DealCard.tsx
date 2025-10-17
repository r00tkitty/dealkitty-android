// DealCard: a reusable "card" UI block that shows one game deal.
// It displays an image, title, price, and icons for the stores where you can claim it.
// It also has a "Claim" button that tells the parent screen to handle the claiming logic.

import { View, Text, Image, Button, Platform } from "react-native"; // Import necessary components from React Native
import SteamLogo from "@/assets/icons/steam.svg";
import EpicLogo from "@/assets/icons/epic.svg";
import GogLogo from "@/assets/icons/gog.svg";
import HumbleLogo from "@/assets/icons/humble.svg";
import FontAwesome5 from "@expo/vector-icons/build/FontAwesome5";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
// Define the props (inputs) that the parent must provide to this component.
// - title: the game name
// - image: URL of the game's banner image
// - price: current price ("Free" for now)
// - platforms: which stores have this deal (e.g., ["steam", "gog"])—we display icons for each
// - onClaim: function to call when user taps the Claim button. We pass platforms to it.
type DealCardProps = {
  title: string; // Title of the deal
  image: string; // Image URL of the deal
  price: string; // Price of the deal
  platforms: string[]; // Array of platform identifiers
  onClaim: () => void; // Callback when the deal is claimed
  dealType?: 'free' | 'insane' | 'sale'; // Optional classification to show a badge
  localApprox?: string; // e.g., "≈ 83INR" to show as tiny superscript next to USD price
  discountPct?: number; // e.g., 90 to render as (90%)
  localKind?: 'exact' | 'approx'; // Visual hint for exact Steam price vs FX-based approx
};

// The component function. It receives the props above from the parent.
export default function DealCard({ title, image, price, platforms, onClaim, dealType, localApprox, discountPct, localKind }: DealCardProps) {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    return (
        // Outer container with a dark background and rounded corners
        <View style={{
        backgroundColor: "#1e1e1e",
        borderRadius: 10,
        padding: 10,
        marginVertical: 8,}}>
            {/* Image container so we can overlay a small badge */}
            <View style={{ position: 'relative' }}>
                <Image
                    // Images in RN need a "source" object; here we load from a URL
                    source={{ uri: image }}
                    style={{ width: "100%", height: 150, borderRadius: 10 }}
                />
                {dealType && (
                  <View
                    accessible
                    accessibilityLabel={`${dealType} deal`}
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      backgroundColor:
                        dealType === 'free' ? '#2e7d32' : dealType === 'insane' ? '#b71c1c' : '#1565c0',
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>
                      {dealType.toUpperCase()}
                    </Text>
                  </View>
                )}
            </View>
            {/* Game title and price */}
            <Text style={{ color: "white" , fontSize: 18, fontWeight: "bold", marginTop: 8 }}>{title}</Text>
            <Text style={{ color: "white", fontSize: 16, marginTop: 4 }}>
              {price}
              {localApprox ? (
                <Text
                  style={{
                    color: '#bbb',
                    fontSize: 11,
                    marginLeft: 4,
                    position: 'relative',
                    top: -3, // emulate superscript
                  }}
                  accessibilityLabel={`Approximate local price ${localApprox}`}
                >{` ${localApprox}`}</Text>
              ) : null}
              {localApprox && localKind ? (
                <Text
                  style={{
                    color: '#888',
                    fontSize: 10,
                    marginLeft: 2,
                    position: 'relative',
                    top: -4,
                  }}
                >{` ${localKind}`}</Text>
              ) : null}
              {typeof discountPct === 'number' && discountPct > 0 ? (
                <Text style={{ color: '#9be89b', fontSize: 14 }}>{` (${Math.round(discountPct)}%)`}</Text>
              ) : null}
            </Text>
            {/* Icons for each platform supported by this deal */}
      <View style={{ flexDirection: "row", gap: 10, marginVertical: 8 }}>
        {platforms.map((platform) => (
          <PlatformIcon key={platform} name={platform} color={theme.icon}/>
        ))}
      </View>
            {/* Claim button: parent decides what to do (open link, choose platform, etc.) */}
      <Button title="Claim" onPress={() => {
        console.log(`Claiming deal: ${title}`)
        onClaim()
        }} />
        </View>
    );
// Small helper component to render the correct store icon for a given platform name.
function PlatformIcon({ name, color }: { name: string; color: string }) {
  // We normalize platform keys like 'steam' | 'epic' | 'gog' | 'humble'.
  // If you add a new store, extend this switch with its SVG or a simple fallback.
  switch (name.toLowerCase()) {
    case "steam":
      return <SteamLogo width={20} height={20} fill={color}/>;
    case "epic":
      return <EpicLogo width={20} height={20} fill={color}/>;
    case "gog":
      return <GogLogo width={20} height={20} fill={color}/>;
    case "humble":
    case "humble store":
      // Some SVG assets have fixed fills. To guarantee visibility on dark UI,
      // place the icon on a light background and omit overriding fills.
      return (
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            backgroundColor: '#ffffff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityLabel="Humble Store"
        >
          <HumbleLogo width={14} height={14} />
        </View>
      );
    default:
      // Unknown store: render a generic icon.
      return <FontAwesome5 name="store" size={20} color={color} />;
  }
}
}