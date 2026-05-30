"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { LuBriefcase, LuBuilding2, LuRefreshCw, LuShieldCheck } from "react-icons/lu";
import { useOfficersDirectory } from "@/src/features/officers/useOfficersDirectory";
import { DeleteOfficerModal } from "@/src/components/officers/DeleteOfficerModal";
import { OfficerCredentialsModal } from "@/src/components/officers/OfficerCredentialsModal";
import { OfficerFiltersBar } from "@/src/components/officers/OfficerFiltersBar";
import { OfficerFormModal } from "@/src/components/officers/OfficerFormModal";
import { OfficerMetrics } from "@/src/components/officers/OfficerMetrics";
import { OfficerTable } from "@/src/components/officers/OfficerTable";
import { ResetPasswordConfirmModal } from "@/src/components/officers/ResetPasswordConfirmModal";
import { useAuthStore } from "@/src/store/auth-store";
import { Button } from "@/src/ui/Button";
import type {
  OfficerFilters,
  OfficerGeneratedCredentials,
  OfficerListItem,
  OfficerRecord,
  OfficerViewer,
} from "@/src/types/officers";

const initialFilters: OfficerFilters = {
  query: "",
  type: "all",
  access: "all",
};

function getScopeCopy(viewer: OfficerViewer) {
  if (viewer.role === "ward") {
    return {
      title: "Ward-scoped officer management",
      description:
        "Ward users can create and manage only officers assigned to their own ward.",
    };
  }

  if (viewer.role === "municipality") {
    return {
      title: "Municipality officer management",
      description:
        "Municipality users can create and manage municipality officers within their own scope.",
    };
  }

  return {
    title: "Centralized officer directory",
    description:
      "Admins can oversee every officer profile and adjust ward or municipality scope as needed.",
  };
}

function toOfficerListItem(officer: OfficerRecord): OfficerListItem {
  return {
    ...officer,
    fullName: `${officer.firstName} ${officer.lastName}`.trim(),
    departmentName: officer.department.name,
    wardName:
      officer.ward?.name ??
      (officer.type === "municipality_officer"
        ? "Municipality-wide"
        : "Ward not assigned"),
    wardCode: officer.ward?.wardCode ?? null,
  };
}

export default function OfficersDashboard() {
  const user = useAuthStore((state) => state.user);
  const viewer = useMemo<OfficerViewer>(
    () => ({
      role: user?.role ?? "ward",
      wardId: user?.ward_id ?? null,
      wardName: user?.ward?.name ?? null,
    }),
    [user?.role, user?.ward_id, user?.ward?.name],
  );
  const scopeCopy = getScopeCopy(viewer);
  const {
    officers,
    departments,
    wards,
    loading,
    error,
    createOfficer,
    updateOfficer,
    deleteOfficer,
    resetOfficerPassword,
    refetch,
    isSaving,
    isDeleting,
    isResetting,
  } = useOfficersDirectory(viewer);
  const [filters, setFilters] = useState<OfficerFilters>(initialFilters);
  const [editingOfficerId, setEditingOfficerId] = useState<string | null>(null);
  const [deletingOfficerId, setDeletingOfficerId] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    credentials: OfficerGeneratedCredentials;
    supportUnit: "ward" | "municipality";
  } | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{
    credentials: OfficerGeneratedCredentials;
    supportUnit: "ward" | "municipality";
  } | null>(null);
  const [resettingOfficerId, setResettingOfficerId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(filters.query.trim().toLowerCase());

  const officerItems = useMemo(
    () => officers.map((officer) => toOfficerListItem(officer)),
    [officers],
  );
  const visibleOfficers =
    viewer.role === "municipality"
      ? officerItems.filter((o) => o.type !== "ward_officer")
      : officerItems;

  const filteredOfficers = useMemo(() => {
    return visibleOfficers.filter((officer) => {
      const matchesQuery =
        deferredQuery.length === 0 ||
        [
          officer.fullName,
          officer.departmentName,
          officer.wardName,
          officer.phoneNumber,
        ]
          .join(" ")
          .toLowerCase()
          .includes(deferredQuery);

      const matchesType =
        filters.type === "all" ? true : officer.type === filters.type;

      const matchesAccess =
        filters.access === "all"
          ? true
          : filters.access === "manageable"
            ? officer.accessLevel === "manageable"
            : officer.accessLevel === "read_only";

      return matchesQuery && matchesType && matchesAccess;
    });
  }, [deferredQuery, filters.access, filters.type, visibleOfficers]);

  const manageableCount = visibleOfficers.filter(
    (officer) => officer.accessLevel === "manageable",
  ).length;
  const readOnlyCount = visibleOfficers.filter(
    (officer) => officer.accessLevel === "read_only",
  ).length;
  const activeDepartmentCount = new Set(
    visibleOfficers.map((officer) => officer.departmentId),
  ).size;
  const editingOfficer =
    officerItems.find((officer) => officer.id === editingOfficerId) ?? null;
  const deletingOfficer =
    officerItems.find((officer) => officer.id === deletingOfficerId) ?? null;

  const canCreate =
    viewer.role === "admin" ||
    viewer.role === "ward" ||
    viewer.role === "municipality";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-gray-500">Officer directory</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
              {scopeCopy.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
              {scopeCopy.description}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <LuBriefcase className="text-lg text-sky-600" />
              <p className="mt-3 text-2xl font-semibold text-gray-900">
                {manageableCount}
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                editable now
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <LuBuilding2 className="text-lg text-emerald-600" />
              <p className="mt-3 text-2xl font-semibold text-gray-900">
                {visibleOfficers.length}
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                visible total
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <LuShieldCheck className="text-lg text-amber-600" />
              <p className="mt-3 text-2xl font-semibold text-gray-900">
                {departments.length}
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                department slots
              </p>
            </div>
          </div>
        </div>
      </section>

      <OfficerMetrics
        totalVisible={visibleOfficers.length}
        manageableCount={manageableCount}
        readOnlyCount={readOnlyCount}
        departmentCount={activeDepartmentCount}
      />

      {error ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-red-200 bg-white text-red-700 hover:bg-red-100"
              leftIcon={<LuRefreshCw />}
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      <OfficerFiltersBar
        viewer={viewer}
        query={filters.query}
        type={filters.type}
        access={filters.access}
        onQueryChange={(query) =>
          setFilters((current) => ({
            ...current,
            query,
          }))
        }
        onTypeChange={(type) =>
          setFilters((current) => ({
            ...current,
            type,
          }))
        }
        onAccessChange={(access) =>
          setFilters((current) => ({
            ...current,
            access,
          }))
        }
        onCreate={() => setEditingOfficerId("new")}
        canCreate={canCreate}
      />

      <OfficerTable
        officers={filteredOfficers}
        isLoading={loading}
        onEdit={(officerId) => setEditingOfficerId(officerId)}
        onDelete={(officerId) => setDeletingOfficerId(officerId)}
        onResetPassword={(officerId) => setResettingOfficerId(officerId)}
      />

      {editingOfficerId !== null ? (
        <OfficerFormModal
          key={editingOfficerId}
          isOpen
          viewer={viewer}
          officer={editingOfficerId === "new" ? null : editingOfficer}
          departments={departments}
          wards={wards}
          isSubmitting={isSaving}
          onClose={() => setEditingOfficerId(null)}
          onSubmit={(values) => {
            const submitPromise =
              editingOfficerId === "new"
                ? createOfficer(values)
                : updateOfficer(editingOfficerId!, values);

            void submitPromise
              .then((credentials) => {
                setEditingOfficerId(null);
                if (editingOfficerId === "new" && credentials) {
                  setCreatedCredentials({
                    credentials,
                    supportUnit:
                      values.type === "municipality_officer"
                        ? "municipality"
                        : "ward",
                  });
                }
              })
              .catch(() => {});
          }}
        />
      ) : null}

      {deletingOfficer ? (
        <DeleteOfficerModal
          isOpen
          officerName={deletingOfficer.fullName}
          isDeleting={isDeleting}
          onClose={() => setDeletingOfficerId(null)}
          onConfirm={() => {
            void deleteOfficer(deletingOfficer.id)
              .then(() => {
                setDeletingOfficerId(null);
              })
              .catch(() => {});
          }}
        />
      ) : null}

      {createdCredentials ? (
        <OfficerCredentialsModal
          isOpen
          credentials={createdCredentials.credentials}
          supportUnit={createdCredentials.supportUnit}
          onClose={() => setCreatedCredentials(null)}
        />
      ) : null}

      {resettingOfficerId !== null ? (() => {
        const officer = officerItems.find((o) => o.id === resettingOfficerId);
        return (
          <ResetPasswordConfirmModal
            isOpen
            officerName={officer?.fullName ?? "this officer"}
            isResetting={isResetting}
            onClose={() => setResettingOfficerId(null)}
            onConfirm={() => {
              void resetOfficerPassword(resettingOfficerId)
                .then((credentials) => {
                  setResettingOfficerId(null);
                  const o = officerItems.find((x) => x.id === resettingOfficerId);
                  setResetCredentials({
                    credentials,
                    supportUnit: o?.type === "municipality_officer" ? "municipality" : "ward",
                  });
                })
                .catch(() => {});
            }}
          />
        );
      })() : null}

      {resetCredentials ? (
        <OfficerCredentialsModal
          isOpen
          credentials={resetCredentials.credentials}
          supportUnit={resetCredentials.supportUnit}
          onClose={() => setResetCredentials(null)}
        />
      ) : null}
    </div>
  );
}
