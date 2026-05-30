// src/lib/reportValidation.ts

export type MediaType = "photo" | "video";
export type LocationSource = "gps" | "manual";

export type ReportDraft = {
  title: string;
  description?: string | null;

  mediaUri: string | null | undefined;
  mediaType: MediaType | null | undefined;

  locationText: string;
  locationSource: LocationSource;

  coords?: { latitude: number; longitude: number } | null;
  accuracyM?: number | null;

  category?: string | null; // ✅ NEW
};

export type ValidationResult = {
  ok: boolean;
  errors: Partial<Record<keyof ReportDraft | "media" | "location", string>>;
};

// --------------------------------------------------
// Emoji detection (safe fallback)
// --------------------------------------------------
let EMOJI_REGEX: RegExp;
try {
  EMOJI_REGEX = /\p{Extended_Pictographic}/u;
} catch {
  EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}]/u;
}

const TITLE_ALLOWED_REGEX = /^[A-Za-z\s.,'"-]+$/;

function hasEmoji(s: string) {
  return EMOJI_REGEX.test(s);
}

function normalize(s: string) {
  return (s ?? "").trim();
}

function isValidLatLng(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// --------------------------------------------------
// MEDIA VALIDATION
// --------------------------------------------------
function looksLikeUri(uri: string) {
  const u = uri.toLowerCase();
  return (
    u.startsWith("file:") ||
    u.startsWith("content:") ||
    u.startsWith("ph:") ||
    u.startsWith("assets-library:") ||
    u.startsWith("http")
  );
}

function mediaExtensionOk(uri: string, type: MediaType) {
  const u = uri.toLowerCase();
  if (!u.includes(".")) return true;

  if (type === "photo") {
    return (
      u.endsWith(".jpg") ||
      u.endsWith(".jpeg") ||
      u.endsWith(".png") ||
      u.endsWith(".heic") ||
      u.endsWith(".webp")
    );
  }

  return (
    u.endsWith(".mp4") ||
    u.endsWith(".mov") ||
    u.endsWith(".m4v") ||
    u.endsWith(".webm")
  );
}

// --------------------------------------------------
// LOCATION VALIDATION
// --------------------------------------------------
function isLikelyLandmark(text: string) {
  const t = normalize(text);
  if (t.length < 6) return false;
  return /[A-Za-z]/.test(t);
}

// --------------------------------------------------
// FIELD VALIDATORS
// --------------------------------------------------
export function validateTitle(rawTitle: string): string | null {
  const title = normalize(rawTitle);

  if (!title) return "Title is required";
  if (title.length < 3) return "Title must be at least 3 characters";
  if (hasEmoji(title)) return "Title cannot include emojis";
  if (/\d/.test(title)) return "Title cannot include numbers";
  if (!TITLE_ALLOWED_REGEX.test(title)) {
    return "Title can only use letters and basic punctuation";
  }

  const lettersOnly = title.replace(/[^A-Za-z]/g, "");
  if (lettersOnly.length < 3) return "Title must contain at least 3 letters";

  return null;
}

export function validateDescription(
  rawDescription?: string | null,
): string | null {
  const desc = normalize(rawDescription ?? "");

  if (!desc) return null;
  if (desc.length < 10) return "Description must be at least 10 characters";
  if (hasEmoji(desc)) return "Description cannot include emojis";

  return null;
}

export function validateMedia(
  mediaUri: string | null | undefined,
  mediaType: MediaType | null | undefined,
): string | null {
  if (!mediaUri) return "Media is required";
  if (!mediaType) return "Media type is required";

  const uri = String(mediaUri);
  if (!looksLikeUri(uri)) return "Invalid media URI";

  if (!mediaExtensionOk(uri, mediaType)) {
    return mediaType === "photo"
      ? "Unsupported photo format"
      : "Unsupported video format";
  }

  return null;
}

export function validateLocation(args: {
  locationText: string;
  locationSource: LocationSource;
  coords?: { latitude: number; longitude: number } | null;
  accuracyM?: number | null;
}): string | null {
  const { locationText, locationSource, coords, accuracyM } = args;

  const text = normalize(locationText);
  if (!text) return "Location is required";

  if (locationSource === "manual") {
    if (!isLikelyLandmark(text)) {
      return "Enter a clear landmark (min 6 characters)";
    }
  }

  if (locationSource === "gps") {
    if (!coords) return "GPS coordinates missing";
    if (!isValidLatLng(coords.latitude, coords.longitude)) {
      return "GPS coordinates invalid";
    }

    // ⚠️ accuracy warning threshold
    if (accuracyM != null && accuracyM > 120) {
      return "GPS accuracy is low. Please retry or adjust.";
    }
  }

  return null;
}

export function validateCategory(category?: string | null): string | null {
  if (!category || !category.trim()) {
    return "Please select a category";
  }
  return null;
}

// --------------------------------------------------
// FULL VALIDATOR
// --------------------------------------------------
export function validateReportDraft(draft: ReportDraft): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  const titleErr = validateTitle(draft.title);
  if (titleErr) errors.title = titleErr;

  const descErr = validateDescription(draft.description);
  if (descErr) errors.description = descErr;

  const mediaErr = validateMedia(draft.mediaUri, draft.mediaType);
  if (mediaErr) errors.media = mediaErr;

  const locErr = validateLocation({
    locationText: draft.locationText,
    locationSource: draft.locationSource,
    coords: draft.coords ?? null,
    accuracyM: draft.accuracyM ?? null,
  });
  if (locErr) errors.location = locErr;

  const catErr = validateCategory(draft.category);
  if (catErr) errors.category = catErr;

  return {
    ok: Object.keys(errors).length === 0,
    errors,
  };
}
