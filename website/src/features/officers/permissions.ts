import type {
  OfficerAccessLevel,
  OfficerFormValues,
  OfficerRecord,
  OfficerType,
  OfficerViewer,
} from "@/src/types/officers";

export function getOfficerAccessLevel(
  officer: OfficerRecord,
  viewer: OfficerViewer,
): OfficerAccessLevel {
  if (viewer.role === "admin") {
    return "manageable";
  }

  if (viewer.role === "ward") {
    return officer.wardId === viewer.wardId ? "manageable" : "hidden";
  }

  if (viewer.role === "municipality") {
    return officer.type === "municipality_officer" ? "manageable" : "read_only";
  }

  return "hidden";
}

export function canManageOfficer(officer: OfficerRecord, viewer: OfficerViewer) {
  return getOfficerAccessLevel(officer, viewer) === "manageable";
}

export function normalizeOfficerInput(
  values: OfficerFormValues,
  viewer: OfficerViewer,
): OfficerFormValues {
  if (viewer.role === "ward") {
    return {
      ...values,
      type: "ward_officer",
      wardId: viewer.wardId,
    };
  }

  if (viewer.role === "municipality") {
    return {
      ...values,
      type: "municipality_officer",
      wardId: null,
    };
  }

  if (values.type === "municipality_officer") {
    return {
      ...values,
      wardId: null,
    };
  }

  return values;
}

export function getAvailableOfficerTypes(viewer: OfficerViewer): OfficerType[] {
  if (viewer.role === "admin") {
    return ["ward_officer", "municipality_officer"];
  }

  if (viewer.role === "ward") {
    return ["ward_officer"];
  }

  if (viewer.role === "municipality") {
    return ["municipality_officer"];
  }

  return [];
}
