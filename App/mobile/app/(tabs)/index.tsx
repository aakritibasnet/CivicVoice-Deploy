import React from "react";
import { View } from "react-native";

import { useAuth } from "@/hooks/useAuth";
import HomeTopRight from "@/components/home/HomeTopRight";
import HomeContent from "@/components/home/HomeContent";

export default function HomeScreen() {
  const { user, avatarUrl, loading } = useAuth();

  if (loading) return <View style={{ flex: 1 }} />;

  return (
    <View style={{ flex: 1 }}>
      <HomeTopRight user={user} avatarUrl={avatarUrl} onOpenMenu={() => {}} />
      <HomeContent user={user} />
    </View>
  );
}
