import { StyleSheet } from "react-native";
import { colors } from "@/theme/colors";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  top: {
    height: 96,
    paddingTop: 48,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  topTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  scroll: {
    padding: 12,
    paddingBottom: 24,
    gap: 12,
  },

  previewWrap: {
    height: 260,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },

  preview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  empty: {
    height: 260,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  emptyText: {
    color: colors.textMuted,
  },

  form: {
    gap: 10,
    paddingTop: 6,
  },

  label: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },

  helperText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: -6,
    marginBottom: 2,
  },

  input: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },

  inputLocked: {
    opacity: 0.85,
  },

  textArea: {
    minHeight: 110,
    textAlignVertical: "top",
  },

  locationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  locationLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 8,
  },

  currentLocPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },

  currentLocText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },

  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.red2,
  },

  locationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
  },

  locationBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },

  changeLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 2,
  },

  changeLocationText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 13,
  },

  footer: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  reportBtn: {
    backgroundColor: colors.red2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  reportText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },

  retakeBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    elevation: 3,
  },
  retakeBtnText: {
    color: "#111",
    fontWeight: "800",
    fontSize: 13,
  },

  visibilityRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.45)",
  },
});
