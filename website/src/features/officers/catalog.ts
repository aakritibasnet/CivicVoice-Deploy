import {
  FIXED_DEPARTMENTS,
  type FixedDepartmentDefinition,
} from "@/src/features/departments/catalog";
import type { OfficerFormValues } from "@/src/types/officers";

export type OfficerDepartmentSeed = FixedDepartmentDefinition;

export const DEFAULT_OFFICER_DEPARTMENTS: OfficerDepartmentSeed[] =
  FIXED_DEPARTMENTS;

export const EMPTY_OFFICER_FORM: OfficerFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  profileImageUrl: null,
  departmentId: "",
  type: "ward_officer",
  wardId: null,
};
