"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { LuImagePlus, LuTrash2 } from "react-icons/lu";
import { EMPTY_OFFICER_FORM } from "@/src/features/officers/catalog";
import { getAvailableOfficerTypes } from "@/src/features/officers/permissions";
import { OfficerAvatar } from "@/src/components/officers/OfficerAvatar";
import { Button } from "@/src/ui/Button";
import { Input } from "@/src/ui/Input";
import { Modal } from "@/src/ui/Modal";
import type {
  DepartmentOption,
  OfficerFormValues,
  OfficerRecord,
  OfficerViewer,
  OfficerWard,
} from "@/src/types/officers";

interface OfficerFormModalProps {
  isOpen: boolean;
  viewer: OfficerViewer;
  officer: OfficerRecord | null;
  departments: DepartmentOption[];
  wards: OfficerWard[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: OfficerFormValues) => void;
}

const selectStyles =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100";

function buildInitialValues(
  viewer: OfficerViewer,
  officer: OfficerRecord | null,
  departments: DepartmentOption[],
): OfficerFormValues {
  if (officer) {
    return {
      firstName: officer.firstName,
      lastName: officer.lastName,
      email: officer.email ?? "",
      phoneNumber: officer.phoneNumber,
      profileImageUrl: officer.profileImageUrl,
      departmentId: officer.departmentId,
      type: officer.type,
      wardId: officer.wardId,
    };
  }

  if (viewer.role === "ward") {
    return {
      ...EMPTY_OFFICER_FORM,
      departmentId: departments[0]?.id ?? "",
      type: "ward_officer",
      wardId: viewer.wardId,
    };
  }

  if (viewer.role === "municipality") {
    return {
      ...EMPTY_OFFICER_FORM,
      departmentId: departments[0]?.id ?? "",
      type: "municipality_officer",
      wardId: null,
    };
  }

  return {
    ...EMPTY_OFFICER_FORM,
    departmentId: departments[0]?.id ?? "",
  };
}

export function OfficerFormModal({
  isOpen,
  viewer,
  officer,
  departments,
  wards,
  isSubmitting,
  onClose,
  onSubmit,
}: OfficerFormModalProps) {
  const [values, setValues] = useState<OfficerFormValues>(
    buildInitialValues(viewer, officer, departments),
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof OfficerFormValues, string>>
  >({});
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const availableTypes = getAvailableOfficerTypes(viewer);
  const canEditEmail =
    officer !== null &&
    ((viewer.role === "ward" &&
      officer.type === "ward_officer" &&
      officer.wardId === viewer.wardId) ||
      (viewer.role === "municipality" &&
        officer.type === "municipality_officer"));

  const emailHelperText =
    officer?.type === "municipality_officer"
      ? canEditEmail
        ? "Only municipality can edit this email."
        : "Municipality officer emails can only be edited by municipality."
      : canEditEmail
        ? "Only the owning ward can edit this email."
        : "Ward officer emails can only be edited by the owning ward.";

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploadingImage(true);
    setErrors((current) => ({ ...current, profileImageUrl: undefined }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/officer-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const result = await response.json();

      setValues((current) => ({
        ...current,
        profileImageUrl: result.secure_url,
      }));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to upload image. Please try again.";
      setErrors((current) => ({
        ...current,
        profileImageUrl: errorMessage,
      }));
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  };

  const handleSubmit = () => {
    const nextErrors: Partial<Record<keyof OfficerFormValues, string>> = {};

    if (!values.firstName.trim()) {
      nextErrors.firstName = "First name is required";
    }

    if (!values.lastName.trim()) {
      nextErrors.lastName = "Last name is required";
    }

    if (!values.departmentId) {
      nextErrors.departmentId = "Department is required";
    }

    if (values.type === "ward_officer" && !values.wardId) {
      nextErrors.wardId = "Ward is required for ward officers";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit(values);
  };

  const namePreview = [values.firstName, values.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={officer ? "Edit officer" : "Create officer"}
      description="Officer credentials are generated automatically from the final name and assigned scope."
      size="lg"
    >
      <div className="space-y-6">
        <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <OfficerAvatar
              name={namePreview || "Officer profile"}
              profileImageUrl={values.profileImageUrl}
              size="lg"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">
                Profile image
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Upload a headshot or leave it blank for initials.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  leftIcon={<LuImagePlus />}
                  className="rounded-xl"
                  onClick={() => fileInputRef.current?.click()}
                  isLoading={isUploadingImage}
                  disabled={isUploadingImage || isSubmitting}
                >
                  {isUploadingImage ? "Uploading..." : "Upload image"}
                </Button>
                {values.profileImageUrl ? (
                  <Button
                    variant="ghost"
                    leftIcon={<LuTrash2 />}
                    className="rounded-xl"
                    disabled={isUploadingImage || isSubmitting}
                    onClick={() => {
                      setValues((current) => ({
                        ...current,
                        profileImageUrl: null,
                      }));
                      setErrors((current) => ({
                        ...current,
                        profileImageUrl: undefined,
                      }));
                    }}
                  >
                    Remove image
                  </Button>
                ) : null}
              </div>
              {errors.profileImageUrl ? (
                <p className="mt-2 text-sm text-red-600">{errors.profileImageUrl}</p>
              ) : null}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={isUploadingImage || isSubmitting}
            className="hidden"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="First name"
            value={values.firstName}
            error={errors.firstName}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                firstName: event.target.value,
              }))
            }
          />
          <Input
            label="Last name"
            value={values.lastName}
            error={errors.lastName}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                lastName: event.target.value,
              }))
            }
          />
          {officer ? (
            <Input
              label="Email address"
              type="email"
              value={values.email}
              disabled={!canEditEmail}
              helperText={emailHelperText}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          ) : null}
          {/* Phone number */}
          <Input
            label="Phone number"
            value={values.phoneNumber}
            helperText="No validation is applied here by design."
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                phoneNumber: event.target.value,
              }))
            }
          />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              Department
            </span>
            <select
              value={values.departmentId}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  departmentId: event.target.value,
                }))
              }
              className={selectStyles}
            >
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            {errors.departmentId ? (
              <p className="mt-1.5 text-sm text-red-600">{errors.departmentId}</p>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              Officer type
            </span>
            <select
              value={values.type}
              onChange={(event) => {
                const nextType = event.target.value as OfficerFormValues["type"];
                setValues((current) => ({
                  ...current,
                  type: nextType,
                  wardId:
                    nextType === "municipality_officer" ? null : current.wardId,
                }));
              }}
              disabled={availableTypes.length <= 1}
              className={selectStyles}
            >
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type === "ward_officer"
                    ? "Ward officer"
                    : "Municipality officer"}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              Ward scope
            </span>
            <select
              value={values.wardId ?? ""}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  wardId: event.target.value || null,
                }))
              }
              disabled={
                viewer.role !== "admin" || values.type === "municipality_officer"
              }
              className={selectStyles}
            >
              {values.type === "municipality_officer" ? (
                <option value="">Municipality-wide scope</option>
              ) : (
                <>
                  <option value="">Select ward</option>
                  {wards.map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      {ward.name} ({ward.wardCode})
                    </option>
                  ))}
                </>
              )}
            </select>
            {errors.wardId ? (
              <p className="mt-1.5 text-sm text-red-600">{errors.wardId}</p>
            ) : null}
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Button
            variant="ghost"
            className="rounded-xl"
            onClick={onClose}
            disabled={isSubmitting || isUploadingImage}
          >
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={departments.length === 0 || isUploadingImage}
          >
            {officer ? "Save changes" : "Create officer"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
