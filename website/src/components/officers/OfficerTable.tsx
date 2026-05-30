"use client";

import { formatDistanceToNow } from "date-fns";
import { LuKeyRound, LuLock, LuPencil, LuTrash2 } from "react-icons/lu";
import { OfficerAvatar } from "@/src/components/officers/OfficerAvatar";
import { Badge } from "@/src/ui/Badge";
import { Button } from "@/src/ui/Button";
import type { OfficerListItem } from "@/src/types/officers";

interface OfficerTableProps {
  officers: OfficerListItem[];
  isLoading: boolean;
  onEdit: (officerId: string) => void;
  onDelete: (officerId: string) => void;
  onResetPassword: (officerId: string) => void;
}

function getTypeLabel(type: OfficerListItem["type"]) {
  return type === "ward_officer" ? "Ward officer" : "Municipality officer";
}

export function OfficerTable({
  officers,
  isLoading,
  onEdit,
  onDelete,
  onResetPassword,
}: OfficerTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      </div>
    );
  }

  if (officers.length === 0) {
    return (
      <div className="rounded-[32px] border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">
          No officers match the current filters
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Adjust the search or filter state to reveal more records.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="hidden rounded-[32px] border border-slate-200 bg-white shadow-sm lg:block">
        <div className="max-h-[min(72vh,calc(100vh-15rem))] overflow-x-auto overflow-y-auto rounded-[32px]">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <th className="px-6 py-4">Officer</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Department</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Scope</th>
              <th className="px-6 py-4">Updated</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {officers.map((officer) => (
                <tr key={officer.id} className="align-top">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <OfficerAvatar
                        name={officer.fullName}
                        profileImageUrl={officer.profileImageUrl}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {officer.fullName}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {officer.phoneNumber || "No phone number"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="break-all text-sm text-slate-600">
                      {officer.email ?? "Generated on create"}
                    </p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="font-medium text-slate-800">
                      {officer.departmentName}
                    </p>
                  </td>
                  <td className="px-6 py-5">
                    <Badge
                      variant={
                        officer.type === "ward_officer" ? "primary" : "success"
                      }
                      size="md"
                    >
                      {getTypeLabel(officer.type)}
                    </Badge>
                  </td>
                  <td className="px-6 py-5">
                    <div className="space-y-2">
                      <p className="font-medium text-slate-800">{officer.wardName}</p>
                      {officer.wardCode ? (
                        <p className="text-sm text-slate-500">{officer.wardCode}</p>
                      ) : null}
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
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-sm text-slate-600">
                      {formatDistanceToNow(new Date(officer.updatedAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-end gap-2">
                      {officer.accessLevel === "manageable" ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<LuPencil />}
                            className="rounded-xl"
                            onClick={() => onEdit(officer.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<LuKeyRound />}
                            className="rounded-xl text-amber-700 hover:bg-amber-50 border-amber-200"
                            onClick={() => onResetPassword(officer.id)}
                          >
                            Reset Password
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            leftIcon={<LuTrash2 />}
                            className="rounded-xl"
                            onClick={() => onDelete(officer.id)}
                          >
                            Delete
                          </Button>
                        </>
                      ) : (
                        <Badge variant="outline" size="sm" className="gap-1.5">
                          <LuLock className="text-xs" />
                          Read only
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:hidden">
        {officers.map((officer) => (
          <article
            key={officer.id}
            className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <OfficerAvatar
                name={officer.fullName}
                profileImageUrl={officer.profileImageUrl}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {officer.fullName}
                  </h3>
                  <Badge
                    variant={
                      officer.type === "ward_officer" ? "primary" : "success"
                    }
                    size="sm"
                  >
                    {getTypeLabel(officer.type)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {officer.phoneNumber || "No phone number"}
                </p>
              </div>
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Email
                </dt>
                <dd className="mt-1 break-all text-sm text-slate-600">
                  {officer.email ?? "Generated on create"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Department
                </dt>
                <dd className="mt-1 text-sm font-medium text-slate-800">
                  {officer.departmentName}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Scope
                </dt>
                <dd className="mt-1 text-sm font-medium text-slate-800">
                  {officer.wardName}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Access
                </dt>
                <dd className="mt-1">
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
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Updated
                </dt>
                <dd className="mt-1 text-sm text-slate-600">
                  {formatDistanceToNow(new Date(officer.updatedAt), {
                    addSuffix: true,
                  })}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              {officer.accessLevel === "manageable" ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<LuPencil />}
                    className="rounded-xl"
                    onClick={() => onEdit(officer.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<LuKeyRound />}
                    className="rounded-xl text-amber-700 hover:bg-amber-50 border-amber-200"
                    onClick={() => onResetPassword(officer.id)}
                  >
                    Reset Password
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={<LuTrash2 />}
                    className="rounded-xl"
                    onClick={() => onDelete(officer.id)}
                  >
                    Delete
                  </Button>
                </>
              ) : (
                <Badge variant="outline" size="sm" className="gap-1.5">
                  <LuLock className="text-xs" />
                  Read only
                </Badge>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
