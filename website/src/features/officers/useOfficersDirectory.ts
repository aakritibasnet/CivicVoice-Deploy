"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  CREATE_OFFICER,
  DELETE_OFFICER,
  GET_OFFICER_DIRECTORY,
  RESET_OFFICER_PASSWORD,
  UPDATE_OFFICER,
} from "@/src/graphql/operations/officers";
import { normalizeOfficerInput } from "@/src/features/officers/permissions";
import type {
  DepartmentOption,
  OfficerFormValues,
  OfficerGeneratedCredentials,
  OfficerRecord,
  OfficerViewer,
  OfficerWard,
} from "@/src/types/officers";

interface OfficerDepartmentNode {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface OfficerWardNode {
  id: string;
  name: string;
  ward_code: string;
}

interface OfficerNode {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  profile_image_url: string | null;
  department_id: string;
  type: "ward_officer" | "municipality_officer";
  ward_id: string | null;
  created_at: string;
  updated_at: string;
  must_change_password: boolean;
  password_changed_at: string | null;
  access_level: "manageable" | "read_only";
  department: OfficerDepartmentNode;
  ward: OfficerWardNode | null;
}

interface OfficerDirectoryQueryData {
  officers: OfficerNode[];
  officerDepartments: OfficerDepartmentNode[];
  wards: OfficerWardNode[];
}

interface CreateOfficerMutationData {
  createOfficer: {
    officer: OfficerNode;
    generated_credentials: OfficerGeneratedCredentials | null;
  };
}

interface UpdateOfficerMutationData {
  updateOfficer: OfficerNode;
}

interface DeleteOfficerMutationData {
  deleteOfficer: boolean;
}

interface ResetOfficerPasswordMutationData {
  resetOfficerPassword: {
    officer: OfficerNode;
    temp_password: string;
  };
}

interface ResetOfficerPasswordMutationVariables {
  id: string;
}

interface CreateOfficerMutationVariables {
  input: {
    first_name: string;
    last_name: string;
    phone_number?: string | null;
    profile_image_url?: string | null;
    department_id: string;
    type: "ward_officer" | "municipality_officer";
    ward_id?: string | null;
  };
}

interface UpdateOfficerMutationVariables {
  id: string;
  input: {
    first_name?: string;
    last_name?: string;
    email?: string | null;
    phone_number?: string | null;
    profile_image_url?: string | null;
    department_id?: string;
    type?: "ward_officer" | "municipality_officer";
    ward_id?: string | null;
  };
}

interface DeleteOfficerMutationVariables {
  id: string;
}

function mapDepartment(node: OfficerDepartmentNode): DepartmentOption {
  return {
    id: node.id,
    slug: node.slug,
    name: node.name,
    description: node.description,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
  };
}

function mapWard(node: OfficerWardNode): OfficerWard {
  return {
    id: node.id,
    name: node.name,
    wardCode: node.ward_code,
  };
}

function mapOfficer(node: OfficerNode): OfficerRecord {
  return {
    id: node.id,
    firstName: node.first_name,
    lastName: node.last_name,
    email: node.email,
    phoneNumber: node.phone_number ?? "",
    profileImageUrl: node.profile_image_url,
    departmentId: node.department_id,
    type: node.type,
    wardId: node.ward_id,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
    mustChangePassword: node.must_change_password,
    passwordChangedAt: node.password_changed_at,
    accessLevel: node.access_level,
    department: mapDepartment(node.department),
    ward: node.ward ? mapWard(node.ward) : null,
  };
}

function buildBaseOfficerInput(values: OfficerFormValues, viewer: OfficerViewer) {
  const scopedValues = normalizeOfficerInput(values, viewer);

  return {
    first_name: scopedValues.firstName.trim(),
    last_name: scopedValues.lastName.trim(),
    phone_number: scopedValues.phoneNumber || null,
    profile_image_url: scopedValues.profileImageUrl,
    department_id: scopedValues.departmentId,
    type: scopedValues.type,
    ward_id: scopedValues.type === "ward_officer" ? scopedValues.wardId : null,
  };
}

function buildCreateOfficerInput(values: OfficerFormValues, viewer: OfficerViewer) {
  return buildBaseOfficerInput(values, viewer);
}

function buildUpdateOfficerInput(values: OfficerFormValues, viewer: OfficerViewer) {
  const scopedValues = normalizeOfficerInput(values, viewer);

  return {
    ...buildBaseOfficerInput(scopedValues, viewer),
    ...((viewer.role === "ward" || viewer.role === "municipality")
      ? { email: scopedValues.email.trim() || null }
      : {}),
  };
}

export function useOfficersDirectory(viewer: OfficerViewer) {
  const { data, loading, error, refetch } = useQuery<OfficerDirectoryQueryData>(
    GET_OFFICER_DIRECTORY,
    {
      fetchPolicy: "cache-and-network",
    },
  );

  const [createOfficerMutation, { loading: isCreating, error: createError }] = useMutation<
    CreateOfficerMutationData,
    CreateOfficerMutationVariables
  >(CREATE_OFFICER);
  const [updateOfficerMutation, { loading: isUpdating, error: updateError }] = useMutation<
    UpdateOfficerMutationData,
    UpdateOfficerMutationVariables
  >(UPDATE_OFFICER);
  const [deleteOfficerMutation, { loading: isDeleting, error: deleteError }] = useMutation<
    DeleteOfficerMutationData,
    DeleteOfficerMutationVariables
  >(DELETE_OFFICER);
  const [resetPasswordMutation, { loading: isResetting, error: resetError }] = useMutation<
    ResetOfficerPasswordMutationData,
    ResetOfficerPasswordMutationVariables
  >(RESET_OFFICER_PASSWORD);

  const officers = (data?.officers ?? []).map(mapOfficer);
  const departments = (data?.officerDepartments ?? []).map(mapDepartment);
  const wards = (data?.wards ?? []).map(mapWard);

  const createOfficer = async (values: OfficerFormValues) => {
    const result = await createOfficerMutation({
      variables: {
        input: buildCreateOfficerInput(values, viewer),
      },
      refetchQueries: [{ query: GET_OFFICER_DIRECTORY }],
      awaitRefetchQueries: true,
    });

    return result.data?.createOfficer.generated_credentials ?? null;
  };

  const updateOfficer = async (officerId: string, values: OfficerFormValues) => {
    await updateOfficerMutation({
      variables: {
        id: officerId,
        input: buildUpdateOfficerInput(values, viewer),
      },
      refetchQueries: [{ query: GET_OFFICER_DIRECTORY }],
      awaitRefetchQueries: true,
    });
  };

  const deleteOfficer = async (officerId: string) => {
    await deleteOfficerMutation({
      variables: { id: officerId },
      refetchQueries: [{ query: GET_OFFICER_DIRECTORY }],
      awaitRefetchQueries: true,
    });
  };

  const resetOfficerPassword = async (officerId: string): Promise<{ email: string; password: string }> => {
    const result = await resetPasswordMutation({
      variables: { id: officerId },
      refetchQueries: [{ query: GET_OFFICER_DIRECTORY }],
      awaitRefetchQueries: true,
    });
    const payload = result.data?.resetOfficerPassword;
    if (!payload) throw new Error("Reset failed");
    return {
      email: payload.officer.email ?? "",
      password: payload.temp_password,
    };
  };

  return {
    officers,
    departments,
    wards,
    loading,
    error:
      error?.message ??
      createError?.message ??
      updateError?.message ??
      deleteError?.message ??
      resetError?.message ??
      null,
    createOfficer,
    updateOfficer,
    deleteOfficer,
    resetOfficerPassword,
    refetch,
    isSaving: isCreating || isUpdating,
    isDeleting,
    isResetting,
  };
}
