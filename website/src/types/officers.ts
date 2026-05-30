import type { UserRole } from "@/src/config/navigation";

export type OfficerType = "ward_officer" | "municipality_officer";
export type OfficerAccessLevel = "manageable" | "read_only" | "hidden";
export type OfficerFilterType = "all" | OfficerType;
export type OfficerFilterAccess = "all" | "manageable" | "read_only";

export interface OfficerWard {
  id: string;
  name: string;
  wardCode: string;
}

export interface DepartmentOption {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfficerRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string;
  profileImageUrl: string | null;
  departmentId: string;
  type: OfficerType;
  wardId: string | null;
  createdAt: string;
  updatedAt: string;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  accessLevel: Exclude<OfficerAccessLevel, "hidden">;
  department: DepartmentOption;
  ward: OfficerWard | null;
}

export interface OfficerGeneratedCredentials {
  email: string;
  password: string;
}

export interface OfficerFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  profileImageUrl: string | null;
  departmentId: string;
  type: OfficerType;
  wardId: string | null;
}

export interface OfficerViewer {
  role: UserRole;
  wardId: string | null;
  wardName: string | null;
}

export interface OfficerListItem extends OfficerRecord {
  fullName: string;
  departmentName: string;
  wardName: string;
  wardCode: string | null;
}

export interface OfficerFilters {
  query: string;
  type: OfficerFilterType;
  access: OfficerFilterAccess;
}

export interface OfficerDirectoryData {
  officers: OfficerRecord[];
  departments: DepartmentOption[];
  wards: OfficerWard[];
}
