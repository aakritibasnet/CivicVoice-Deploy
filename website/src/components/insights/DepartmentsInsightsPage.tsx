"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  LuArrowRight,
  LuBuilding2,
  LuShieldCheck,
  LuUsers,
} from "react-icons/lu";
import { useOfficersDirectory } from "@/src/features/officers/useOfficersDirectory";
import { useAuthStore } from "@/src/store/auth-store";
import { Badge } from "@/src/ui/Badge";
import { Button } from "@/src/ui/Button";

function getScopeLabel(type: "ward_officer" | "municipality_officer", wardName: string | null) {
  if (type === "municipality_officer") {
    return "Municipality";
  }

  return wardName ?? "Ward";
}

export default function DepartmentsInsightsPage() {
  const user = useAuthStore((state) => state.user);
  const viewer = useMemo(
    () => ({
      role: user?.role ?? "ward",
      wardId: user?.ward_id ?? null,
      wardName: user?.ward?.name ?? null,
    }),
    [user?.role, user?.ward_id, user?.ward?.name],
  );
  const {
    officers: allOfficers,
    departments,
    loading,
    error,
    refetch,
  } = useOfficersDirectory(viewer);

  const officers = useMemo(
    () =>
      viewer.role === "municipality"
        ? allOfficers.filter((o) => o.type !== "ward_officer")
        : allOfficers,
    [allOfficers, viewer.role],
  );

  const departmentGroups = useMemo(() => {
    return departments.map((department) => {
      const departmentOfficers = officers.filter(
        (officer) => officer.departmentId === department.id,
      );

      return {
        department,
        officers: departmentOfficers,
        officerCount: departmentOfficers.length,
        manageableCount: departmentOfficers.filter(
          (officer) => officer.accessLevel === "manageable",
        ).length,
      };
    });
  }, [departments, officers]);

  const totalManageable = officers.filter(
    (officer) => officer.accessLevel === "manageable",
  ).length;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[36px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_32%),linear-gradient(135deg,_#ffffff,_#f8fafc_45%,_#f0fdf4)] p-6 shadow-sm lg:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" size="md" className="gap-1.5">
                <LuBuilding2 className="text-xs" />
                Department insights
              </Badge>
              <Badge variant="outline" size="md">
                Fixed five-department model
              </Badge>
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Officer grouping by department
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              View how officers are distributed across the fixed department
              catalog. Department names are locked; officer membership is
              managed from the officer directory.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
              <LuBuilding2 className="text-lg text-emerald-600" />
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {departments.length}
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                fixed departments
              </p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
              <LuUsers className="text-lg text-sky-600" />
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {officers.length}
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                visible officers
              </p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
              <LuShieldCheck className="text-lg text-amber-600" />
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {totalManageable}
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                editable records
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end">
        <Link
          href="/dashboard/officers"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <span>Manage officer departments</span>
          <LuArrowRight className="text-sm" />
        </Link>
      </div>

      {error ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-center justify-between gap-4">
            <p>{error}</p>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {departmentGroups.map(({ department, officers: departmentOfficers, officerCount, manageableCount }) => (
          <section
            key={department.id}
            className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  {department.name}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {department.description}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold text-slate-900">
                  {loading ? "..." : officerCount}
                </p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  officers
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" size="sm">
                {manageableCount} editable
              </Badge>
              <Badge variant="outline" size="sm">
                {officerCount - manageableCount} read only
              </Badge>
            </div>

            <div className="mt-5 space-y-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-2xl bg-slate-100"
                  />
                ))
              ) : departmentOfficers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No officers are currently assigned to this department.
                </div>
              ) : (
                departmentOfficers.map((officer) => (
                  <article
                    key={officer.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {officer.firstName} {officer.lastName}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {officer.email ?? "Credentials generated on create"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {getScopeLabel(officer.type, officer.ward?.name ?? null)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          officer.accessLevel === "manageable"
                            ? "success"
                            : "outline"
                        }
                        size="sm"
                      >
                        {officer.accessLevel === "manageable"
                          ? "Editable"
                          : "Read only"}
                      </Badge>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
