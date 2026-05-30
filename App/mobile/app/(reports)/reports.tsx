import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  View,
  Pressable,
  Alert,
  Keyboard,
  Modal,
  Text,
  Image,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";

import TopBar from "@/components/report/TopBar";
import MediaPreview from "@/components/report/MediaPreview";
import ReportForm from "@/components/report/ReportForm";
import FooterSubmit from "@/components/report/FooterSubmit";
import CategoryDropdown from "@/components/ui/common/CategoryDropdown";
import { styles } from "@/components/report/ReportsScreen.styles";

import { useReportDraft, submitReportFromDraft } from "@/store/reportDraft";
import { useUserPrefs } from "@/store/userPrefs";
import { useUploadProgress } from "@/store/uploadProgress";
import { getAccessToken } from "@/lib/session";
import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import {
  findSimilarReports,
  toggleUpvote,
  analyzeReportImage,
  type SimilarReport,
  type AiSuggestedPriority,
} from "@/api/reports";
import { colors } from "@/theme/colors";
import { useToast } from "@/components/ui/feedback/ToastProvider";
import FormErrorNotice from "@/components/ui/feedback/FormErrorNotice";
import { AnimatedPressable } from "@/components/ui/tap-feedback";
import { getFriendlyErrorMessage } from "@/lib/feedback";

// Acceptable range: 1-99 so the route-local touch blocker stays below global overlays.
const SUBMISSION_TOUCH_BLOCKER_Z_INDEX = 90;

export default function ReportsScreen() {
  const params = useLocalSearchParams<{
    mediaUri?: string | string[];
    mediaType?: string | string[];
  }>();

  const mediaUri = Array.isArray(params.mediaUri)
    ? params.mediaUri[0]
    : params.mediaUri || null;
  const mediaTypeParam = Array.isArray(params.mediaType)
    ? params.mediaType[0]
    : params.mediaType;
  const normalizedMediaType = mediaTypeParam === "photo" ? "photo" : "video";

  const {
    title,
    description,
    category,
    isPublic,
    address,
    gpsCoords,
    gpsAccuracyM,
    pickedCoords,
    userAdjustedLocation,
    aiAnalyzedUri,
    setDraft,
  } = useReportDraft();

  const setTitle = (v: string) => setDraft({ title: v });
  const setDescription = (v: string) => setDraft({ description: v });
  const setCategory = (v: string) => setDraft({ category: v });
  const setIsPublic = (v: boolean) => setDraft({ isPublic: v });
  const setAddress = (v: string) => setDraft({ address: v });

  const setPickedCoords = (coords: { latitude: number; longitude: number }) =>
    setDraft({ pickedCoords: coords, userAdjustedLocation: true });

  const { aiEnabled } = useUserPrefs();

  const { location, request } = useDeviceLocation(!gpsCoords);

  // Recenter snaps the map back to a fresh GPS fix of the user's current
  // location, overriding any manual drag so the pin tracks where they are now.
  const recenterToCurrentLocation = useCallback(async () => {
    const loc = await request();
    if (!loc) return null;

    setDraft({
      gpsCoords: loc,
      gpsAccuracyM: loc.accuracyM ?? null,
      pickedCoords: loc,
      userAdjustedLocation: false,
    });

    return { latitude: loc.latitude, longitude: loc.longitude };
  }, [request, setDraft]);

  useEffect(() => {
    if (!location) return;
    if (gpsCoords && (pickedCoords || userAdjustedLocation)) return;

    setDraft({
      ...(!gpsCoords
        ? {
            gpsCoords: location,
            gpsAccuracyM: location.accuracyM ?? null,
          }
        : {}),
      ...(!pickedCoords && !userAdjustedLocation
        ? { pickedCoords: location }
        : {}),
    });
  }, [gpsCoords, location, pickedCoords, setDraft, userAdjustedLocation]);

  // Background upload is now handled globally by useBackgroundUpload in _layout.tsx
  const { setProgress, setStatus, reset: resetProgress } = useUploadProgress();

  const [similarReports, setSimilarReports] = useState<SimilarReport[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submissionLocked, setSubmissionLocked] = useState(false);
  const submissionLockRef = useRef(false);
  const { showToast } = useToast();

  // ─── AI Vision auto-fill ──────────────────────────────────
  const [aiState, setAiState] = useState<
    "idle" | "analyzing" | "done" | "failed"
  >("idle");
  const [aiPriority, setAiPriority] = useState<AiSuggestedPriority | null>(null);
  const [aiBannerDismissed, setAiBannerDismissed] = useState(false);

  // Reset AI UI when the user disables AI in settings.
  useEffect(() => {
    if (!aiEnabled) {
      setAiState("idle");
      setAiPriority(null);
      setAiBannerDismissed(false);
    }
  }, [aiEnabled]);

  // Effect 1 — Init banner when camera pre-started AI for this photo.
  // Reads draft via getState() to avoid title/description as deps (would cause
  // this to fire on every keystroke).
  useEffect(() => {
    if (!mediaUri || aiAnalyzedUri !== mediaUri) return;
    setAiBannerDismissed(false);
    const state = useReportDraft.getState();
    if (state.title.trim() || state.description.trim()) {
      if (state.aiSuggestedPriority) setAiPriority(state.aiSuggestedPriority);
      setAiState("done");
    } else {
      setAiPriority(null);
      setAiState("analyzing");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUri, aiAnalyzedUri]);

  // Effect 2 — Detect when background AI (started in camera) completes.
  // Narrow deps intentional: we only care about title/description changing.
  useEffect(() => {
    if (aiState !== "analyzing" || !mediaUri || aiAnalyzedUri !== mediaUri) return;
    if (!title.trim() && !description.trim()) return;
    const priority = useReportDraft.getState().aiSuggestedPriority;
    if (priority) setAiPriority(priority);
    setAiState("done");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description]);

  // Effect 3 — Local AI fallback: only runs if camera did not pre-start AI.
  // Reads aiAnalyzedUri via getState() so it isn't a dep (avoids re-running
  // when the store value changes after setDraft below).
  useEffect(() => {
    if (!mediaUri || normalizedMediaType !== "photo") return;
    if (!aiEnabled) return;
    if (useReportDraft.getState().aiAnalyzedUri === mediaUri) return;

    setDraft({
      aiAnalyzedUri: mediaUri,
      title: "",
      description: "",
      aiPriorityToken: null,
      aiPriorityTokenMediaUri: null,
      aiSuggestedPriority: null,
    });
    setAiState("analyzing");
    setAiBannerDismissed(false);
    setAiPriority(null);
    let cancelled = false;

    (async () => {
      const result = await analyzeReportImage(mediaUri as string);
      if (cancelled) return;
      if (!result) {
        setAiState("failed");
        return;
      }
      setDraft({
        title: result.title,
        description: result.description,
        category: result.category,
        aiSuggestedPriority: result.suggested_priority,
        aiPriorityToken: result.priority_token ?? null,
        aiPriorityTokenMediaUri: result.priority_token ? mediaUri : null,
      });
      setAiPriority(result.suggested_priority);
      setAiState("done");
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUri, normalizedMediaType, aiEnabled]);

  const lockSubmission = () => {
    if (submissionLockRef.current) return false;

    submissionLockRef.current = true;
    setSubmissionLocked(true);
    return true;
  };

  const unlockSubmission = () => {
    submissionLockRef.current = false;
    setSubmissionLocked(false);
  };

  const doSubmit = async () => {
    if (!mediaUri || !pickedCoords) return;

    const token = await getAccessToken();

    try {
      setStatus("uploading");
      setProgress(0);

      const result = await submitReportFromDraft({
        token,
        mediaUri: mediaUri as string,
        mediaType: normalizedMediaType,
        onProgress: (sent, total) => {
          setProgress(total > 0 ? sent / total : 0);
        },
      });

      if (result?.offlineSaved) {
        setStatus("offline_queued");
        showToast({
          type: "info",
          title: "Saved offline",
          message:
            "Your report will upload automatically when you're back online.",
        });
        router.replace("/(tabs)");
        return;
      }

      setStatus("success");

      if (!token) {
        const wardMsg = result?.data?.wardName
          ? ` It was routed to ${result.data.wardName}.`
          : "";
        Alert.alert(
          "Report Submitted!",
          `Your report was submitted anonymously.${wardMsg} Login to track status updates and earn badges.`,
          [
            { text: "Continue", onPress: () => router.replace("/(tabs)") },
            {
              text: "Create Account",
              onPress: () => router.replace("/(auth)/signup"),
            },
          ],
        );
        return;
      }

      const wardInfo = result?.data?.wardName
        ? ` Routed to ${result.data.wardName}.`
        : "";
      showToast({
        type: "success",
        title: "Report submitted",
        message: `Report submitted successfully.${wardInfo}`,
      });
      setTimeout(() => resetProgress(), 2000);
      router.replace("/(tabs)");
    } catch (e: any) {
      setStatus("error", e.message);
      showToast({
        type: "error",
        title: "Upload failed",
        message: getFriendlyErrorMessage(
          e,
          "Something went wrong. Please try again.",
        ),
      });
    } finally {
    }
  };

  const validateForm = (): string | null => {
    if (!mediaUri) return "Please attach a photo or video of the issue.";
    if (!title.trim()) return "Please add a short title.";
    if (description.trim().length < 10)
      return "Please describe the issue in at least 10 characters.";
    if (!category) return "Please choose a category.";
    if (!pickedCoords)
      return "Please set the location on the map before submitting.";
    return null;
  };

  const onSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!lockSubmission()) return;

    Keyboard.dismiss();
    setFormError(null);

    try {
      // Check for similar reports before submitting
      if (pickedCoords && category) {
        try {
          const similar = await findSimilarReports(
            pickedCoords.latitude,
            pickedCoords.longitude,
            category,
          );
          if (similar.length > 0) {
            setSimilarReports(similar);
            setShowDuplicateModal(true);
            return;
          }
        } catch {}
      }

      await doSubmit();
    } finally {
      unlockSubmission();
    }
  };

  const submitWithoutDuplicateCheck = async () => {
    if (!lockSubmission()) return;

    Keyboard.dismiss();

    try {
      await doSubmit();
    } finally {
      unlockSubmission();
    }
  };

  const handleUpvoteSimilar = async (reportId: string) => {
    // Check if user already upvoted this report
    const report = similarReports.find((r) => r.id === reportId);
    if (report?.user_upvoted) {
      showToast({
        type: "info",
        title: "Already upvoted",
        message: "You have already upvoted this report.",
      });
      return;
    }

    try {
      const result = await toggleUpvote(reportId);

      // If the server says it was removed (user somehow already had it), don't navigate away
      if (!result.upvoted) {
        showToast({
          type: "info",
          title: "Already upvoted",
          message: "You have already upvoted this report.",
        });
        // Mark it as upvoted locally so button updates
        setSimilarReports((prev) =>
          prev.map((item) =>
            item.id !== reportId ? item : { ...item, user_upvoted: true },
          ),
        );
        return;
      }

      setSimilarReports((prev) =>
        prev.map((item) =>
          item.id !== reportId
            ? item
            : {
                ...item,
                user_upvoted: true,
                upvote_count:
                  typeof result.upvote_count === "number"
                    ? result.upvote_count
                    : item.upvote_count + 1,
              },
        ),
      );
      setShowDuplicateModal(false);
      showToast({
        type: "success",
        title: "Report upvoted",
        message: "Your support helps prioritize this issue for the ward team.",
      });
      router.replace("/(tabs)");
    } catch (error) {
      showToast({
        type: "error",
        title: "Couldn't upvote",
        message: getFriendlyErrorMessage(
          error,
          "Something went wrong. Please try again.",
        ),
      });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding" })}
    >
      <TopBar onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <MediaPreview mediaUri={mediaUri} />

        {formError && (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <FormErrorNotice message={formError} />
          </View>
        )}

        {aiState === "analyzing" && (
          <View style={aiStyles.banner}>
            <ActivityIndicator size="small" color={colors.red2} />
            <Text style={aiStyles.bannerText}>
              AI is analyzing your photo…
            </Text>
          </View>
        )}

        {aiState === "done" && !aiBannerDismissed && (
          <View style={[aiStyles.banner, aiStyles.bannerDone]}>
            <Ionicons name="sparkles" size={18} color={colors.red2} />
            <View style={{ flex: 1 }}>
              <Text style={aiStyles.bannerText}>
                Pre-filled by AI — review and edit anything below.
              </Text>
              {!!aiPriority && (
                <Text style={aiStyles.bannerSub}>
                  Suggested priority: {aiPriority.toUpperCase()}
                </Text>
              )}
            </View>
            <Pressable
              hitSlop={8}
              onPress={() => setAiBannerDismissed(true)}
              accessibilityLabel="Dismiss AI suggestion notice"
            >
              <Ionicons
                name="close"
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
        )}

        {aiState === "failed" && !aiBannerDismissed && (
          <View style={[aiStyles.banner, aiStyles.bannerFailed]}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.textMuted}
            />
            <Text style={[aiStyles.bannerText, { flex: 1 }]}>
              AI auto-fill is unavailable. Please fill in the details
              manually.
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => setAiBannerDismissed(true)}
              accessibilityLabel="Dismiss notice"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        <CategoryDropdown value={category} onChange={setCategory} />

        <ReportForm
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
          address={address}
          onAddressChange={setAddress}
          gpsCoords={gpsCoords}
          gpsAccuracyM={gpsAccuracyM}
          pickedCoords={pickedCoords}
          onPickCoords={setPickedCoords}
          onRecenterToGPS={recenterToCurrentLocation}
          isPublic={isPublic}
          setIsPublic={setIsPublic}
        />
      </ScrollView>

      <FooterSubmit onSubmit={onSubmit} disabled={submissionLocked} />

      {submissionLocked && (
        <View pointerEvents="auto" style={submitLockStyles.touchBlocker} />
      )}

      {/* Duplicate detection modal */}
      <Modal
        visible={showDuplicateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDuplicateModal(false)}
      >
        <View style={dupStyles.backdrop}>
          <View style={dupStyles.sheet}>
            <View style={dupStyles.header}>
              <Ionicons name="alert-circle" size={24} color="#F59E0B" />
              <Text style={dupStyles.headerTitle}>Similar Reports Found</Text>
            </View>
            <Text style={dupStyles.headerDesc}>
              We found {similarReports.length} similar report
              {similarReports.length > 1 ? "s" : ""} nearby. You can upvote an
              existing one instead of creating a duplicate.
            </Text>

            <FlatList
              data={similarReports}
              keyExtractor={(item) => item.id}
              style={dupStyles.list}
              contentContainerStyle={dupStyles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={dupStyles.card}>
                  {(item.media_url ||
                    (item.photo_urls && item.photo_urls[0])) && (
                    <Image
                      source={{ uri: item.media_url || item.photo_urls![0] }}
                      style={dupStyles.cardImage}
                      resizeMode="cover"
                    />
                  )}
                  <View style={dupStyles.cardBody}>
                    <Text style={dupStyles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={dupStyles.cardMeta}>
                      <Text style={dupStyles.cardDistance}>
                        {item.distance_m}m away
                      </Text>
                      <Text style={dupStyles.cardDot}>·</Text>
                      <Text style={dupStyles.cardCategory}>
                        {item.category}
                      </Text>
                      {item.ward_name ? (
                        <>
                          <Text style={dupStyles.cardDot}>·</Text>
                          <Text style={dupStyles.cardCategory}>
                            {item.ward_name}
                          </Text>
                        </>
                      ) : null}
                    </View>
                    <View style={dupStyles.cardActions}>
                      <Text style={dupStyles.upvoteCount}>
                        {item.upvote_count} upvote
                        {item.upvote_count !== 1 ? "s" : ""}
                      </Text>
                      {item.user_upvoted ? (
                        <View
                          style={[
                            dupStyles.upvoteBtn,
                            dupStyles.upvotedBtn,
                          ]}
                        >
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#10B981"
                          />
                          <Text style={dupStyles.upvotedBtnText}>
                            Already Upvoted
                          </Text>
                        </View>
                      ) : (
                        <AnimatedPressable
                          style={dupStyles.upvoteBtn}
                          onPress={() => handleUpvoteSimilar(item.id)}
                          tapVariant="button"
                        >
                          <Ionicons
                            name="arrow-up-circle"
                            size={18}
                            color="#3B82F6"
                          />
                          <Text style={dupStyles.upvoteBtnText}>
                            Upvote This
                          </Text>
                        </AnimatedPressable>
                      )}
                    </View>
                  </View>
                </View>
              )}
            />

            <View style={dupStyles.footer}>
              <Pressable
                style={dupStyles.submitAnywayBtn}
                onPress={() => {
                  setShowDuplicateModal(false);
                  void submitWithoutDuplicateCheck();
                }}
                android_ripple={{ color: "rgba(255,255,255,0.18)" }}
              >
                <Text style={dupStyles.submitAnywayText}>Submit Anyway</Text>
              </Pressable>
              <Pressable
                style={dupStyles.cancelBtn}
                onPress={() => setShowDuplicateModal(false)}
                android_ripple={{ color: "rgba(15,23,42,0.08)" }}
              >
                <Text style={dupStyles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const dupStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingTop: 20,
    paddingBottom: Platform.select({ ios: 34, default: 20 }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  headerDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  list: {
    paddingHorizontal: 20,
  },
  listContent: {
    paddingBottom: 8,
  },
  card: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardImage: {
    width: 90,
    height: "100%",
    minHeight: 90,
  },
  cardBody: {
    flex: 1,
    padding: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  cardDistance: {
    fontSize: 11,
    fontWeight: "700",
    color: "#F59E0B",
  },
  cardDot: {
    fontSize: 11,
    color: colors.textMuted,
  },
  cardCategory: {
    fontSize: 11,
    color: colors.textMuted,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  upvoteCount: {
    fontSize: 12,
    color: colors.textMuted,
  },
  upvoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: "#3B82F6" + "14",
  },
  upvoteBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3B82F6",
  },
  upvotedBtn: {
    backgroundColor: "#10B981" + "14",
  },
  upvotedBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10B981",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  submitAnywayBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.red2,
  },
  submitAnywayText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.white,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
});

const submitLockStyles = StyleSheet.create({
  touchBlocker: {
    ...StyleSheet.absoluteFillObject,
    zIndex: SUBMISSION_TOUCH_BLOCKER_Z_INDEX,
    elevation: SUBMISSION_TOUCH_BLOCKER_Z_INDEX,
  },
});

const aiStyles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.red2 + "12",
    borderWidth: 1,
    borderColor: colors.red2 + "33",
  },
  bannerDone: {
    backgroundColor: colors.red2 + "12",
    borderColor: colors.red2 + "33",
  },
  bannerFailed: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  bannerSub: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: 2,
  },
});
