// New conversation screen for officers.
//
// Ward officers can chat with:
//   - Ward dashboard accounts (their ward's org account on the website)
//   - Their ward peers (other officers in the same ward)
//
// Municipality officers can chat with:
//   - Their municipality dashboard account
//   - All ward dashboard accounts in their municipality
//   - Their municipality peers (other municipality officers)

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { colors } from "@/theme/colors";
import { useAuth } from "@/hooks/useAuth";
import {
  listPeers,
  listWardOrgs,
  listMunicipalityOrgs,
  createChat,
  type ChatPeer,
  type WardOrg,
  type MunicipalityOrg,
} from "@/api/chat";

function initials(p: ChatPeer): string {
  return `${p.first_name[0] ?? ""}${p.last_name[0] ?? ""}`.toUpperCase();
}

export default function NewChatScreen() {
  const { user } = useAuth();
  const isOfficer = !!user;
  const isWardOfficer = user?.type === "ward_officer";
  const isMunicipalityOfficer = user?.type === "municipality_officer";

  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [openingWardOrgId, setOpeningWardOrgId] = useState<string | null>(null);
  const [openingMunicipalityOrgId, setOpeningMunicipalityOrgId] =
    useState<string | null>(null);

  const peersQuery = useQuery({
    queryKey: ["chatPeers"],
    queryFn: listPeers,
    enabled: isOfficer,
  });

  const wardOrgsQuery = useQuery({
    queryKey: ["wardOrgs"],
    queryFn: listWardOrgs,
    enabled: isOfficer,
  });

  const municipalityOrgsQuery = useQuery({
    queryKey: ["municipalityOrgs"],
    queryFn: listMunicipalityOrgs,
    enabled: isOfficer && isMunicipalityOfficer,
  });

  const filtered = useMemo(() => {
    const all = peersQuery.data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (p) =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.department_name ?? "").toLowerCase().includes(q),
    );
  }, [peersQuery.data, search]);

  const wardOrgs = wardOrgsQuery.data ?? [];
  const municipalityOrgs = municipalityOrgsQuery.data ?? [];

  const openWardOrgChat = async (wardOrg: WardOrg) => {
    setOpeningWardOrgId(wardOrg.id);
    try {
      const chat = await createChat({
        type: "officer_ward",
        title: wardOrg.ward_name,
        participants: [{ kind: "user", id: wardOrg.id }],
      });
      router.replace({
        pathname: "/officer-chat/[id]",
        params: { id: chat.id, title: wardOrg.ward_name, type: chat.type },
      });
    } catch {
      setOpeningWardOrgId(null);
    }
  };

  const openMunicipalityOrgChat = async (org: MunicipalityOrg) => {
    setOpeningMunicipalityOrgId(org.id);
    try {
      const chat = await createChat({
        type: "municipality_internal",
        title: org.municipality_name,
        participants: [{ kind: "user", id: org.id }],
      });
      router.replace({
        pathname: "/officer-chat/[id]",
        params: {
          id: chat.id,
          title: org.municipality_name,
          type: chat.type,
        },
      });
    } catch {
      setOpeningMunicipalityOrgId(null);
    }
  };

  const openPeerChat = async (peer: ChatPeer) => {
    setOpening(peer.id);
    try {
      const type = isWardOfficer ? "officer_ward" : "municipality_internal";
      const chat = await createChat({
        type,
        title: `${peer.first_name} ${peer.last_name}`,
        participants: [{ kind: "officer", id: peer.id }],
      });
      router.replace({
        pathname: "/officer-chat/[id]",
        params: {
          id: chat.id,
          title: `${peer.first_name} ${peer.last_name}`,
          type: chat.type,
        },
      });
    } catch {
      setOpening(null);
    }
  };

  const peerSectionTitle = isWardOfficer
    ? "WARD COLLEAGUES"
    : "MUNICIPALITY COLLEAGUES";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>New conversation</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search colleagues…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable hitSlop={8} onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {isMunicipalityOfficer &&
        !municipalityOrgsQuery.isLoading &&
        municipalityOrgs.length > 0 &&
        !search.trim() && (
          <View>
            <Text style={styles.sectionLabel}>MUNICIPALITY DASHBOARD</Text>
            {municipalityOrgs.map((org) => (
              <Pressable
                key={org.id}
                style={styles.peerRow}
                onPress={() => openMunicipalityOrgChat(org)}
                disabled={openingMunicipalityOrgId === org.id}
              >
                <View style={[styles.avatar, { backgroundColor: colors.text }]}>
                  <Ionicons name="business" size={20} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{org.municipality_name}</Text>
                  <Text style={styles.rowSub}>
                    Municipality dashboard - {org.name}
                  </Text>
                </View>
                {openingMunicipalityOrgId === org.id ? (
                  <ActivityIndicator color={colors.red2} size="small" />
                ) : (
                  <Ionicons
                    name="chatbubble-outline"
                    size={20}
                    color={colors.textMuted}
                  />
                )}
              </Pressable>
            ))}
          </View>
        )}

      {/* Ward dashboard accounts */}
      {!wardOrgsQuery.isLoading && wardOrgs.length > 0 && !search.trim() && (
        <View>
          <Text style={styles.sectionLabel}>
            {wardOrgs.length === 1 ? "WARD DASHBOARD" : "WARD DASHBOARDS"}
          </Text>
          {wardOrgs.map((wardOrg) => (
            <Pressable
              key={wardOrg.id}
              style={styles.peerRow}
              onPress={() => openWardOrgChat(wardOrg)}
              disabled={openingWardOrgId === wardOrg.id}
            >
              <View style={[styles.avatar, { backgroundColor: colors.text }]}>
                <Ionicons name="business" size={20} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{wardOrg.ward_name}</Text>
                <Text style={styles.rowSub}>Ward dashboard · {wardOrg.name}</Text>
              </View>
              {openingWardOrgId === wardOrg.id ? (
                <ActivityIndicator color={colors.red2} size="small" />
              ) : (
                <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
              )}
            </Pressable>
          ))}
        </View>
      )}

      {peersQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red2} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListHeaderComponent={
            <Text style={styles.sectionLabel}>
              {peerSectionTitle} ({filtered.length})
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="people-outline"
                size={48}
                color={colors.border}
                style={{ marginBottom: 8 }}
              />
              <Text style={styles.emptyTitle}>No colleagues found</Text>
              {search.trim() ? (
                <Text style={styles.emptySub}>Try a different search.</Text>
              ) : (
                <Text style={styles.emptySub}>
                  No other officers are in your{" "}
                  {isWardOfficer ? "ward" : "municipality"} yet.
                </Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.peerRow}
              onPress={() => openPeerChat(item)}
              disabled={opening === item.id}
            >
              {item.profile_image_url ? (
                <Image
                  source={{ uri: item.profile_image_url }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(item)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {item.first_name} {item.last_name}
                </Text>
                {item.department_name ? (
                  <Text style={styles.rowSub}>{item.department_name}</Text>
                ) : null}
              </View>
              {opening === item.id ? (
                <ActivityIndicator color={colors.red2} size="small" />
              ) : (
                <Ionicons
                  name="chatbubble-outline"
                  size={20}
                  color={colors.textMuted}
                />
              )}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  back: { padding: 2 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  peerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    height: 46,
    width: 46,
    borderRadius: 23,
    backgroundColor: colors.red2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  center: {
    paddingTop: 60,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.textMuted },
  emptySub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
});
