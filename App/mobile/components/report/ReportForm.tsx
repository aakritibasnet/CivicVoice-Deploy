import React from "react";
import { View, Text, Switch, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles as reportStyles } from "@/components/report/ReportsScreen.styles";
import { colors } from "@/theme/colors";

import AppInput from "../ui/common/AppInput";
import LocationPickerMap from "./LocationPickerMap";
import WardBadge from "./WardBadge";
import { useWardDetection } from "@/hooks/useWardDetection";

type Props = {
  title: string;
  setTitle: (v: string) => void;
  titleError?: string;

  description: string;
  setDescription: (v: string) => void;
  descriptionError?: string;

  submitError?: string;

  gpsCoords: { latitude: number; longitude: number } | null;
  gpsAccuracyM: number | null;
  pickedCoords: { latitude: number; longitude: number } | null;
  onPickCoords: (c: { latitude: number; longitude: number }) => void;
  onRecenterToGPS: () => void | Promise<{
    latitude: number;
    longitude: number;
  } | null | void>;
  locationError?: string;

  address: string;
  onAddressChange: (value: string) => void;

  isPublic: boolean;
  setIsPublic: (v: boolean) => void;
};

export default function ReportForm({
  title,
  setTitle,
  titleError,
  description,
  setDescription,
  descriptionError,
  submitError,
  gpsCoords,
  gpsAccuracyM,
  pickedCoords,
  onPickCoords,
  onRecenterToGPS,
  locationError,
  address,
  onAddressChange,
  isPublic,
  setIsPublic,
}: Props) {
  const MIN_CHARS = 10;
  const charCount = description.length;
  const remaining = MIN_CHARS - charCount;
  const mapCenter = pickedCoords ?? gpsCoords;

  // Ward detection follows the same coordinate source shown on the map.
  const {
    ward,
    municipality: detectedMunicipality,
    loading: wardLoading,
    detected: wardDetected,
    error: wardError,
  } = useWardDetection(mapCenter);

  return (
    <View style={reportStyles.form}>
      <AppInput
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="Write a short title"
      />
      {!!titleError && (
        <Text style={reportStyles.helperText}>{titleError}</Text>
      )}

      <AppInput
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Explain what happened"
        multiline
      />

      <Text style={reportStyles.helperText}>
        {charCount === 0
          ? "Add details to help authorities respond faster"
          : charCount < MIN_CHARS
            ? `Add ${remaining} more characters for useful detail`
            : "Looks good"}
      </Text>

      {!!descriptionError && (
        <Text style={reportStyles.helperText}>{descriptionError}</Text>
      )}

      <View style={localStyles.visibilityCard}>
        <View style={localStyles.visibilityHeader}>
          <Ionicons
            name={isPublic ? "earth-outline" : "lock-closed-outline"}
            size={22}
            color={isPublic ? colors.red2 : colors.textMuted}
          />
          <Text style={localStyles.visibilityTitle}>
            {isPublic ? "Public Report" : "Private Report"}
          </Text>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: colors.border, true: colors.red2 + "60" }}
            thumbColor={isPublic ? colors.red2 : "#ccc"}
          />
        </View>

        <Text style={localStyles.visibilityDesc}>
          {isPublic
            ? "This report will appear on the community map. Other citizens can upvote and comment to bring faster attention."
            : "Only government authorities will see this report. Use for sensitive issues or personal safety concerns."}
        </Text>
      </View>

      <View style={reportStyles.locationHeaderRow}>
        <Text style={reportStyles.label}>Location</Text>

        {gpsAccuracyM != null && (
          <View style={reportStyles.currentLocPill}>
            <Text style={reportStyles.currentLocText}>
              GPS +/-{Math.round(Math.max(gpsAccuracyM, 50))}m
            </Text>
          </View>
        )}
      </View>

      {mapCenter ? (
        <LocationPickerMap
          initialLatitude={mapCenter.latitude}
          initialLongitude={mapCenter.longitude}
          gpsCoords={gpsCoords}
          gpsAccuracyM={gpsAccuracyM}
          onPick={onPickCoords}
          onRecenterToGPS={onRecenterToGPS}
          onAddressChange={onAddressChange}
          errorText={locationError}
        />
      ) : (
        <Text style={{ opacity: 0.7, marginTop: 8 }}>
          Getting your location...
        </Text>
      )}

      {!!address && <Text style={localStyles.addressLabel}>{address}</Text>}

      {/* ─── Ward Detection Badge ───────────────── */}
      <WardBadge
        ward={ward}
        loading={wardLoading}
        detected={wardDetected}
        error={wardError}
        municipality={detectedMunicipality}
      />

      {!!locationError && (
        <Text style={reportStyles.helperText}>{locationError}</Text>
      )}

      {!!submitError && (
        <Text style={[reportStyles.helperText, { marginTop: 8 }]}>
          {submitError}
        </Text>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  visibilityCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  visibilityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  visibilityTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  visibilityDesc: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  addressLabel: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textMuted,
  },
});
