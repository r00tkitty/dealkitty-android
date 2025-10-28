// DealCard: a reusable "card" UI block that shows one game deal.
// It displays an image, title, price, and icons for the stores where you can claim it.
// It also has a "Claim" button that tells the parent screen to handle the claiming logic.

import { View, Text, Image, Pressable } from "react-native"; // Import necessary components from React Native
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
    const storeLabel = (name: string) => {
      switch ((name || '').toLowerCase()) {
        case 'steam': return 'Steam';
        case 'epic': return 'Epic Games Store';
        case 'humble':
        case 'humble store': return 'Humble Store';
        case 'gog': return 'GOG';
        default: return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
      }
    };
  return (
    // Minimal card: neutral background, thin border, no shadows
    <View style={{
    backgroundColor: colorScheme === 'dark' ? "#181818" : "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: colorScheme === 'dark' ? "#2a2a2a" : "#e8e8e8",
    }}>
            {/* Image container so we can overlay a small badge */}
            <View style={{ position: 'relative', borderRadius: 10, overflow: 'hidden' }}>
                <Image
                    // Images in RN need a "source" object; here we load from a URL
                    source={{ uri: image }}
                    style={{ width: "100%", height: 150 }}
                    resizeMode="cover"
                />
                {dealType && (
                  <View
                    accessible
                    accessibilityLabel={`${dealType} deal`}
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      paddingVertical: 3,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      backgroundColor:
                        dealType === 'free' ? '#16a34a' : dealType === 'insane' ? '#dc2626' : '#2563eb',
                      // subtle shadow to keep readable on busy images
                      shadowColor: '#000',
                      shadowOpacity: 0.25,
                      shadowRadius: 3,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: 2,
                    }}
                  >
                    <Text style={{
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: 11,
                      letterSpacing: 0.3,
                    }}>
                      {dealType.toUpperCase()}
                    </Text>
                  </View>
                )}
            </View>
            {/* Title */}
            <Text
              style={{ color: colorScheme === 'dark' ? "#f5f5f5" : "#111" , fontSize: 16, fontWeight: "700", marginTop: 10 }}
              numberOfLines={2}
            >
              {title}
            </Text>
            {/* Price row */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6, flexWrap: 'wrap' }}>
              <Text style={{ color: colorScheme === 'dark' ? "#f5f5f5" : "#111", fontSize: 16, fontWeight: '700' }}>
                {price}
                {/* tiny superscript local price */}
                {localApprox ? (
                  <Text
                    style={{
                      color: colorScheme === 'dark' ? '#a0a0a0' : '#6b7280',
                      fontSize: 11,
                      marginLeft: 4,
                      position: 'relative',
                      top: -3, // emulate superscript
                      fontVariant: ['tabular-nums'],
                    }}
                    accessibilityLabel={`Local price ${localApprox}${localKind ? ` ${localKind}` : ''}`}
                  >{` ${localApprox}`}</Text>
                ) : null}
                {/* tiny tag "exact"/"approx" for steam vs FX */}
                {localApprox && localKind ? (
                  <Text
                    style={{
                      color: colorScheme === 'dark' ? '#8e8e8e' : '#9aa0a6',
                      fontSize: 10,
                      marginLeft: 2,
                      position: 'relative',
                      top: -4,
                    }}
                  >{` ${localKind}`}</Text>
                ) : null}
              </Text>
              {/* Green discount percent once, at the end */}
              {typeof discountPct === 'number' && discountPct > 0 ? (
                <Text style={{ color: '#12b981', fontSize: 14, marginLeft: 6 }}>{`(${Math.round(discountPct)}%)`}</Text>
              ) : null}
            </View>

            {/* Footer: minimalist platforms text + outline claim */}
            <View
              style={{
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {/* Minimal platforms text (e.g., Steam · Epic · GOG) */}
              <Text style={{ color: colorScheme === 'dark' ? '#b0b0b0' : '#6b7280', fontSize: 13 }} numberOfLines={1}>
                {platforms.map(p => storeLabel(p)).join(' · ')}
              </Text>

              {/* Claim outline button */}
              <Pressable
                onPress={() => { console.log(`Claiming deal: ${title}`); onClaim(); }}
                accessibilityRole="button"
                accessibilityLabel={`Claim ${title}`}
                android_ripple={{ color: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', borderless: false }}
                style={{
                  backgroundColor: 'transparent',
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colorScheme === 'dark' ? '#3a3a3a' : '#cfcfcf',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <FontAwesome5 name="external-link-alt" size={12} color={colorScheme === 'dark' ? '#e5e7eb' : '#374151'} />
                <Text style={{ color: colorScheme === 'dark' ? '#e5e7eb' : '#374151', fontWeight: '700' }}>Claim</Text>
              </Pressable>
            </View>
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