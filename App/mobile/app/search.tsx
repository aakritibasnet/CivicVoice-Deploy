import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  searchPublicDirectory,
  searchPublicTasks,
  type DirectoryDepartmentResult,
  type DirectoryOfficerResult,
  type TaskSearchResult,
} from "@/api/search";
import Avatar from "@/components/ui/profile/Avatar";
import {
  AnimatedIconButton,
  AnimatedPressable,
} from "@/components/ui/tap-feedback";
import { colors } from "@/theme/colors";

function statusColor(status: string) {
  switch (status) {
    case "resolved":
      return "#16A34A";
    case "in_progress":
      return "#F59E0B";
    case "submitted":
    case "incoming":
      return "#6B7280";
    case "closed":
    case "invalid":
      return "#EF4444";
    default:
      return colors.textMuted;
  }
}

function friendlyStatus(status: string) {
  const map: Record<string, string> = {
    submitted: "Planned",
    incoming: "Incoming",
    under_review: "Under Review",
    in_progress: "In Progress",
    resolved: "Completed",
    closed: "Closed",
    invalid: "Invalid",
  };

  return map[status] || status;
}

export default function SearchScreen() {
  const [query, setQuery] = useState("");

  const isDirectoryMode = query.startsWith("@");
  const isPlaceMode = query.startsWith("/");
  const searchTerm = (isDirectoryMode || isPlaceMode
    ? query.slice(1)
    : query
  ).trim();

  const taskQuery = useQuery({
    queryKey: ["publicSearch", isPlaceMode ? "place" : "general", searchTerm],
    queryFn: () =>
      searchPublicTasks(searchTerm, isPlaceMode ? "place" : "general"),
    enabled: !isDirectoryMode && searchTerm.length >= 2,
    staleTime: 10_000,
  });

  const directoryQuery = useQuery({
    queryKey: ["directorySearch", searchTerm],
    queryFn: () => searchPublicDirectory(searchTerm),
    enabled: isDirectoryMode,
    staleTime: 10_000,
  });

  const taskResults: TaskSearchResult[] = taskQuery.data ?? [];
  const directoryResults = directoryQuery.data ?? {
    officers: [],
    departments: [],
  };

  const onSelectTask = useCallback((item: TaskSearchResult) => {
    router.push({ pathname: "/report/[id]", params: { id: item.id } });
  }, []);

  const onSelectOfficer = useCallback((item: DirectoryOfficerResult) => {
    router.push({ pathname: "/officer/[id]", params: { id: item.id } });
  }, []);

  const placeholder = isDirectoryMode
    ? "Search officers or departments"
    : isPlaceMode
      ? "Search by place, ward, or location"
      : 'Search tasks, type "/" for places, "@" for officers';

  const renderTask = ({ item }: { item: TaskSearchResult }) => (
    <AnimatedPressable
      style={styles.resultCard}
      onPress={() => onSelectTask(item)}
      tapVariant="card"
    >
      <View style={styles.resultTop}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {item.title || "Untitled"}
        </Text>
        <View
          style={[
            styles.statusPill,
            { borderColor: statusColor(item.status) },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: statusColor(item.status) },
            ]}
          >
            {friendlyStatus(item.status)}
          </Text>
        </View>
      </View>

      {!!item.description && (
        <Text style={styles.resultDesc} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View style={styles.resultMeta}>
        {!!item.category && <Text style={styles.metaText}>{item.category}</Text>}
        {!!item.address_text && (
          <Text style={styles.metaText} numberOfLines={1}>
            {item.address_text}
          </Text>
        )}
        {!!item.ward_name && (
          <Text style={styles.metaText}>
            {item.ward_name}
            {item.ward_code ? ` (${item.ward_code})` : ""}
          </Text>
        )}
      </View>
    </AnimatedPressable>
  );

  const renderOfficer = ({ item }: { item: DirectoryOfficerResult }) => (
    <AnimatedPressable
      style={styles.directoryCard}
      onPress={() => onSelectOfficer(item)}
      tapVariant="card"
    >
      <Avatar name={item.name} imageUrl={item.profile_image_url} size={46} />
      <View style={styles.directoryBody}>
        <Text style={styles.directoryTitle}>{item.name}</Text>
        <Text style={styles.directoryMeta}>
          {item.department_name || "Unassigned department"}
          {item.ward_name ? ` - ${item.ward_name}` : ""}
        </Text>
        <Text style={styles.directorySubtle}>
          {item.completed_tasks} completed - {item.active_tasks} active
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </AnimatedPressable>
  );

  const renderDepartment = ({
    item,
  }: {
    item: DirectoryDepartmentResult;
  }) => (
    <View style={styles.directoryCardStatic}>
      <View style={styles.departmentIcon}>
        <Ionicons name="business-outline" size={20} color={colors.red2} />
      </View>
      <View style={styles.directoryBody}>
        <Text style={styles.directoryTitle}>{item.name}</Text>
        <Text style={styles.directoryMeta}>
          {item.ward_name}
          {item.ward_code ? ` - ${item.ward_code}` : ""}
        </Text>
        <Text style={styles.directorySubtle}>
          {item.officer_count} officer{item.officer_count === 1 ? "" : "s"}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AnimatedIconButton onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </AnimatedIconButton>

        <View style={styles.searchBox}>
          <Ionicons
            name={
              isDirectoryMode
                ? "at-outline"
                : isPlaceMode
                  ? "location-outline"
                  : "search-outline"
            }
            size={18}
            color={
              isDirectoryMode || isPlaceMode ? colors.red2 : colors.textMuted
            }
          />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <AnimatedIconButton onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.textMuted}
              />
            </AnimatedIconButton>
          )}
        </View>
      </View>

      <View style={styles.modeIndicator}>
        <Ionicons
          name={
            isDirectoryMode
              ? "people-outline"
              : isPlaceMode
                ? "location-outline"
                : "search-outline"
          }
          size={14}
          color={colors.red2}
        />
        <Text style={styles.modeText}>
          {isDirectoryMode
            ? "Officer and department shortlist"
            : isPlaceMode
              ? "Place search for registered wards and locations"
              : 'Task search. Use "/" for places and "@" for officer directory'}
        </Text>
      </View>

      {isDirectoryMode ? (
        <FlatList
          data={directoryResults.officers}
          keyExtractor={(item) => item.id}
          renderItem={renderOfficer}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.directorySectionWrap}>
              <Text style={styles.sectionTitle}>Officers</Text>
              {directoryQuery.isFetching ? (
                <ActivityIndicator
                  color={colors.red2}
                  style={styles.sectionLoader}
                />
              ) : null}
            </View>
          }
          ListFooterComponent={
            <View style={styles.directorySectionWrap}>
              <Text style={styles.sectionTitle}>Departments</Text>
              {directoryResults.departments.length === 0 ? (
                <Text style={styles.emptySectionText}>
                  No matching departments
                </Text>
              ) : (
                directoryResults.departments.map((department) => (
                  <View key={department.id}>
                    {renderDepartment({ item: department })}
                  </View>
                ))
              )}
            </View>
          }
          ListEmptyComponent={
            !directoryQuery.isFetching ? (
              <View style={styles.emptyWrap}>
                <Ionicons
                  name="people-outline"
                  size={48}
                  color={colors.border}
                />
                <Text style={styles.emptyTitle}>No officers found</Text>
                <Text style={styles.emptyText}>
                  Try another officer, department, or ward keyword.
                </Text>
              </View>
            ) : null
          }
        />
      ) : searchTerm.length >= 2 ? (
        <FlatList
          data={taskResults}
          keyExtractor={(item) => item.id}
          renderItem={renderTask}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            taskQuery.isFetching ? (
              <ActivityIndicator
                color={colors.red2}
                style={styles.sectionLoader}
              />
            ) : null
          }
          ListEmptyComponent={
            !taskQuery.isFetching ? (
              <View style={styles.emptyWrap}>
                <Ionicons
                  name={isPlaceMode ? "location-outline" : "search-outline"}
                  size={48}
                  color={colors.border}
                />
                <Text style={styles.emptyTitle}>
                  {isPlaceMode ? "No places found" : "No tasks found"}
                </Text>
                <Text style={styles.emptyText}>
                  {isPlaceMode
                    ? "Try a ward, street, or registered location keyword."
                    : "Try different task words or switch to place search."}
                </Text>
              </View>
            ) : null
          }
        />
      ) : (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>Search Reports</Text>
          <Text style={styles.emptyText}>
            Normal text searches tasks.{"\n"}
            Start with &quot;/&quot; to search by place.{"\n"}
            Start with &quot;@&quot; to shortlist officers and departments.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingTop: Platform.select({ ios: 60, android: 48, default: 48 }),
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  modeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.red2 + "10",
  },
  modeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: colors.red2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  resultCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  resultTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  resultTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  resultDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  resultMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  directorySectionWrap: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  sectionLoader: {
    marginVertical: 16,
  },
  directoryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  directoryCardStatic: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  directoryBody: {
    flex: 1,
  },
  departmentIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.red2 + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  directoryTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  directoryMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  directorySubtle: {
    marginTop: 3,
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "700",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  emptySectionText: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
});
