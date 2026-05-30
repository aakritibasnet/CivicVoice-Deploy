"use client";

import React from "react";
// Consolidating to Lucide for a consistent stroke-weight look
import { LuFileText, LuClock, LuTrendingUp } from "react-icons/lu";
import { IoAlertCircleOutline } from "react-icons/io5";
import { CiCircleCheck } from "react-icons/ci";

import { useAuthStore } from "@/src/store/auth-store";
import StatCard from "./StatCard";

export default function DashboardHome() {
  const { user } = useAuthStore();
  const scopeLabel =
    user?.role === "ward"
      ? "your ward"
      : user?.role === "municipality"
        ? "the municipality"
        : "the full dashboard";

  // TODO: Replace with real GraphQL query
  const stats = {
    totalReports: 156,
    pendingReports: 23,
    inProgressReports: 18,
    completedReports: 102,
    invalidReports: 13,
    resolutionRate: 85.3,
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">
          Welcome back, {user?.name?.split(" ")[0] || "User"}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Here&apos;s what&apos;s happening across {scopeLabel} today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Total Reports"
          value={stats.totalReports}
          icon={<LuFileText />}
          color="blue"
          change={{ value: "12% this week", positive: true }}
        />

        <StatCard
          label="Pending"
          value={stats.pendingReports}
          icon={<LuClock />}
          color="yellow"
        />

        <StatCard
          label="In Progress"
          value={stats.inProgressReports}
          icon={<IoAlertCircleOutline />} // Fixed: Using LuAlertCircle
          color="purple"
        />

        <StatCard
          label="Completed"
          value={stats.completedReports}
          icon={<CiCircleCheck />} // Fixed: Using LuCheckCircle2 for consistency
          color="green"
          change={{ value: "8% this month", positive: true }}
        />

        <StatCard
          label="Invalid"
          value={stats.invalidReports}
          icon={<IoAlertCircleOutline />} // Fixed: Consistent with other alert styles
          color="red"
        />

        <StatCard
          label="Resolution Rate"
          value={`${stats.resolutionRate}%`}
          icon={<LuTrendingUp />}
          color="green"
          change={{ value: "3.2%", positive: true }}
        />
      </div>

      {/* Placeholder panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Reports */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Recent Reports
          </h3>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50"
              >
                <div className="h-10 w-10 rounded-lg bg-gray-200 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Recent Activity
          </h3>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-full bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-1/3 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
