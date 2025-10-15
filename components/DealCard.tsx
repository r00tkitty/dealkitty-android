// DealCard: a reusable "card" UI block that shows one game deal.
// It displays an image, title, price, and icons for the stores where you can claim it.
// It also has a "Claim" button that tells the parent screen to handle the claiming logic.

import { View, Text, Image, Button, Platform } from "react-native"; // Import necessary components from React Native
import SteamLogo from "@/assets/icons/steam.svg";
import EpicLogo from "@/assets/icons/epic.svg";
import GogLogo from "@/assets/icons/gog.svg";
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
  onClaim: (platforms: string[]) => void; // Callback when the deal is claimed
};

// The component function. It receives the props above from the parent.
export default function DealCard({ title, image, price, platforms, onClaim }: DealCardProps) {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    return (
        // Outer container with a dark background and rounded corners
        <View style={{
        backgroundColor: "#1e1e1e",
        borderRadius: 10,
        padding: 10,
        marginVertical: 8,}}>
            <Image
                // Images in RN need a "source" object; here we load from a URL
                source={{ uri: image }}
                style={{ width: "100%", height: 150, borderRadius: 10 }}
                />
            {/* Game title and price */}
            <Text style={{ color: "white" , fontSize: 18, fontWeight: "bold", marginTop: 8 }}>{title}</Text>
            <Text style={{ color: "white", fontSize: 16, marginTop: 4 }}>{price}</Text>
            {/* Icons for each platform supported by this deal */}
            <View style={{ flexDirection: "row", gap: 10, marginVertical: 8 }}>
                {platforms.map((platform) => (
                    <PlatformIcon key={platform} name={platform} color={theme.icon}/>
                ))}
            </View>
            {/* Claim button: parent decides what to do (open link, choose platform, etc.) */}
            <Button title="Claim" onPress={() => {
                console.log(`Claiming deal: ${title}`)
                onClaim(platforms)
                }} />
        </View>
    );
// Small helper component to render the correct store icon for a given platform name.
function PlatformIcon({ name, color }: { name: string; color: string }) {
  switch (name) {
    case "steam":
      return <SteamLogo width={20} height={20} fill={color}/>;
    case "epic":
      return <EpicLogo width={20} height={20} fill={color}/>;
    case "gog":
      return <GogLogo width={20} height={20} fill={color}/>;
    default:
      return <FontAwesome5 name="question" size={20} color="gray" />;
  }
}
}