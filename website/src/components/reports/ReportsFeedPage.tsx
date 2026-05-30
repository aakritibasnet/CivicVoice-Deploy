"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  LuCheck,
  LuChevronDown,
  LuLoaderCircle,
  LuShieldAlert,
} from "react-icons/lu";
import {
  CREATE_RATING,
  GET_REPORT_FEED,
  GET_REPORT_FEED_SCOPE,
  GET_TASK_REPORT_FEED,
  TOGGLE_BOOKMARK,
  UPDATE_RATING,
} from "@/src/graphql/operations/report-posts";
import { useAuthStore } from "@/src/store/auth-store";
import type {
  CreateRatingData,
  GetReportFeedData,
  GetReportFeedScopeData,
  GetTaskReportFeedData,
  ReportFeedSort,
  ReportPost,
  TaskReportFeedSort,
  ToggleBookmarkData,
  UpdateRatingData,
} from "@/src/types/report-posts";
import ReportCard from "./ReportCard";
import TaskFeedCard from "./TaskFeedCard";

type ReportsTab = "completed" | "incoming" | "escalated" | "invalid";

interface FilterOption {
  value: string;
  label: string;
  description?: string;
}

function getTabOptions(viewerRole?: string | null) {
  const isMunicipalityView = viewerRole === "municipality";

  return [
    {
      id: "completed" as const,
      label: "Completed",
      description: "Public completion stories with reviews and discussion.",
    },
    {
      id: "incoming" as const,
      label: "Incoming",
      description: isMunicipalityView
        ? "Fresh escalations that just entered municipality workflow."
        : "Fresh and active reports still gathering support.",
    },
    {
      id: "escalated" as const,
      label: "Escalated",
      description: isMunicipalityView
        ? "Escalated tasks already moving through municipality handling."
        : "Tasks moved up to municipality for intervention.",
    },
    {
      id: "invalid" as const,
      label: "Invalid",
      description: "Closed-out reports with a recorded reason.",
    },
  ];
}

function computeNextRatingState(post: ReportPost, nextRating: number) {
  if (post.viewer_rating) {
    return {
      rating_average:
        (post.rating_average * post.rating_count - post.viewer_rating + nextRating) /
        Math.max(post.rating_count, 1),
      rating_count: post.rating_count,
      viewer_rating: nextRating,
    };
  }

  return {
    rating_average:
      (post.rating_average * post.rating_count + nextRating) /
      (post.rating_count + 1),
    rating_count: post.rating_count + 1,
    viewer_rating: nextRating,
  };
}

function getTaskFeedVariables(
  tab: Exclude<ReportsTab, "completed">,
  wardId: string,
  category: string,
  sort: TaskReportFeedSort,
  cursor: string | null,
  viewerRole?: string | null,
) {
  const isMunicipalityView = viewerRole === "municipality";

  if (tab === "incoming") {
    return {
      wardId: wardId || null,
      category: category || null,
      cursor,
      limit: 9,
      sort,
      statuses: isMunicipalityView ? ["incoming"] : ["incoming", "in_progress", "returned"],
      escalated: isMunicipalityView ? true : false,
    };
  }

  if (tab === "escalated") {
    return {
      wardId: wardId || null,
      category: category || null,
      cursor,
      limit: 9,
      sort,
      statuses: isMunicipalityView
        ? ["in_progress", "returned"]
        : ["incoming", "in_progress", "returned"],
      escalated: true,
    };
  }

  return {
    wardId: wardId || null,
    category: category || null,
    cursor,
    limit: 9,
    sort,
    statuses: ["invalid"],
    escalated: null,
  };
}

function mergeConnectionResults<T extends { id: string }>(
  previous: {
    nodes: T[];
    pageInfo: { endCursor: string | null; hasMore: boolean };
  },
  next: {
    nodes: T[];
    pageInfo: { endCursor: string | null; hasMore: boolean };
  },
) {
  return {
    nodes: [
      ...previous.nodes,
      ...next.nodes.filter(
        (item) => !previous.nodes.some((existing) => existing.id === item.id),
      ),
    ],
    pageInfo: next.pageInfo,
  };
}

function FilterDropdown({
  label,
  valueLabel,
  options,
  onSelect,
}: {
  label: string;
  valueLabel: string;
  options: FilterOption[];
  onSelect: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 text-left text-sm text-gray-700 outline-none transition hover:border-gray-300 focus:border-gray-900"
      >
        <span className="truncate">{valueLabel}</span>
        <LuChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_28px_60px_-40px_rgba(15,23,42,0.5)]">
          <div className="max-h-72 overflow-y-auto p-2">
            {options.map((option) => {
              const isSelected = option.label === valueLabel;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onSelect(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                    isSelected ? "bg-gray-50" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="mt-0.5 block text-xs leading-5 text-gray-500">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <LuCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-900" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeedSection({
  title,
  subtitle,
  count,
  loading,
  emptyMessage,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  count: number;
  loading: boolean;
  emptyMessage: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
            {title}
          </h2>
          <p className="text-sm leading-6 text-gray-500">{subtitle}</p>
        </div>
        <div className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">
          {count} visible
        </div>
      </div>

      {loading && count === 0 ? (
        <div className="flex justify-center rounded-[2rem] border border-gray-200 bg-white px-6 py-14">
          <LuLoaderCircle className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      ) : count === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
          <p className="text-sm text-gray-500">{emptyMessage}</p>
        </div>
      ) : (
        <>
          {children}
          {footer}
        </>
      )}
    </section>
  );
}

export default function ReportsFeedPage() {
  const user = useAuthStore((state) => state.user);
  const [selectedTabs, setSelectedTabs] = useState<ReportsTab[]>(["completed"]);
  const [wardId, setWardId] = useState("");
  const [category, setCategory] = useState("");
  const [completedSort, setCompletedSort] = useState<ReportFeedSort>("latest");
  const [taskSort, setTaskSort] = useState<TaskReportFeedSort>("recent");
  const [postOverrides, setPostOverrides] = useState<
    Record<string, Partial<ReportPost>>
  >({});
  const [hasAppliedScopeDefaults, setHasAppliedScopeDefaults] = useState(false);

  const tabOptions = useMemo(() => getTabOptions(user?.role), [user?.role]);

  const { data: scopeData, loading: isScopeLoading } =
    useQuery<GetReportFeedScopeData>(GET_REPORT_FEED_SCOPE);

  useEffect(() => {
    if (isScopeLoading || hasAppliedScopeDefaults) {
      return;
    }

    setWardId(scopeData?.reportFeedScope.defaultWardId ?? "");
    setHasAppliedScopeDefaults(true);
  }, [
    hasAppliedScopeDefaults,
    isScopeLoading,
    scopeData?.reportFeedScope.defaultWardId,
  ]);

  const completedVariables = useMemo(
    () => ({
      wardId: wardId || null,
      category: category || null,
      cursor: null,
      limit: 9,
      sort: completedSort,
    }),
    [category, completedSort, wardId],
  );

  const incomingVariables = useMemo(
    () => getTaskFeedVariables("incoming", wardId, category, taskSort, null, user?.role),
    [category, taskSort, user?.role, wardId],
  );
  const escalatedVariables = useMemo(
    () => getTaskFeedVariables("escalated", wardId, category, taskSort, null, user?.role),
    [category, taskSort, user?.role, wardId],
  );
  const invalidVariables = useMemo(
    () => getTaskFeedVariables("invalid", wardId, category, taskSort, null, user?.role),
    [category, taskSort, user?.role, wardId],
  );

  const {
    data: completedData,
    loading: isCompletedLoading,
    fetchMore: fetchMoreCompleted,
    refetch: refetchCompleted,
  } = useQuery<GetReportFeedData>(GET_REPORT_FEED, {
    variables: completedVariables,
    skip: !hasAppliedScopeDefaults || !selectedTabs.includes("completed"),
    notifyOnNetworkStatusChange: true,
  });

  const {
    data: incomingData,
    loading: isIncomingLoading,
    fetchMore: fetchMoreIncoming,
  } = useQuery<GetTaskReportFeedData>(GET_TASK_REPORT_FEED, {
    variables: incomingVariables,
    skip: !hasAppliedScopeDefaults || !selectedTabs.includes("incoming"),
    notifyOnNetworkStatusChange: true,
  });

  const {
    data: escalatedData,
    loading: isEscalatedLoading,
    fetchMore: fetchMoreEscalated,
  } = useQuery<GetTaskReportFeedData>(GET_TASK_REPORT_FEED, {
    variables: escalatedVariables,
    skip: !hasAppliedScopeDefaults || !selectedTabs.includes("escalated"),
    notifyOnNetworkStatusChange: true,
  });

  const {
    data: invalidData,
    loading: isInvalidLoading,
    fetchMore: fetchMoreInvalid,
  } = useQuery<GetTaskReportFeedData>(GET_TASK_REPORT_FEED, {
    variables: invalidVariables,
    skip: !hasAppliedScopeDefaults || !selectedTabs.includes("invalid"),
    notifyOnNetworkStatusChange: true,
  });

  const [createRating] = useMutation<CreateRatingData>(CREATE_RATING);
  const [updateRating] = useMutation<UpdateRatingData>(UPDATE_RATING);
  const [toggleBookmark] = useMutation<ToggleBookmarkData>(TOGGLE_BOOKMARK);

  const completedPosts = useMemo(
    () =>
      (completedData?.getReportFeed.nodes ?? []).map((post) => ({
        ...post,
        ...(postOverrides[post.id] ?? {}),
      })),
    [completedData?.getReportFeed.nodes, postOverrides],
  );

  const incomingReports = incomingData?.getTaskReportFeed.nodes ?? [];
  const escalatedReports = escalatedData?.getTaskReportFeed.nodes ?? [];
  const invalidReports = invalidData?.getTaskReportFeed.nodes ?? [];

  const completedPageInfo = completedData?.getReportFeed.pageInfo ?? {
    endCursor: null,
    hasMore: false,
  };
  const incomingPageInfo = incomingData?.getTaskReportFeed.pageInfo ?? {
    endCursor: null,
    hasMore: false,
  };
  const escalatedPageInfo = escalatedData?.getTaskReportFeed.pageInfo ?? {
    endCursor: null,
    hasMore: false,
  };
  const invalidPageInfo = invalidData?.getTaskReportFeed.pageInfo ?? {
    endCursor: null,
    hasMore: false,
  };

  const scope = scopeData?.reportFeedScope;
  const selectedLabels = tabOptions.filter((option) =>
    selectedTabs.includes(option.id),
  ).map((option) => option.label);
  const totalVisible =
    (selectedTabs.includes("completed") ? completedPosts.length : 0) +
    (selectedTabs.includes("incoming") ? incomingReports.length : 0) +
    (selectedTabs.includes("escalated") ? escalatedReports.length : 0) +
    (selectedTabs.includes("invalid") ? invalidReports.length : 0);

  const wardOptions = useMemo<FilterOption[]>(
    () => [
      {
        value: "",
        label:
          scope?.wardScopeLabel ??
          (user?.role === "municipality"
            ? "All wards in municipality"
            : "All wards"),
      },
      ...(scope?.wards ?? []).map((ward) => ({
        value: ward.id,
        label: ward.name,
        description: ward.ward_code,
      })),
    ],
    [scope?.wardScopeLabel, scope?.wards, user?.role],
  );

  const categoryOptions = useMemo<FilterOption[]>(
    () => [
      { value: "", label: "All categories" },
      ...(scope?.categories ?? []).map((entry) => ({
        value: entry,
        label: entry,
      })),
    ],
    [scope?.categories],
  );

  const wardLabel =
    wardOptions.find((option) => option.value === wardId)?.label ??
    wardOptions[0]?.label ??
    "All wards";
  const categoryLabel =
    categoryOptions.find((option) => option.value === category)?.label ??
    "All categories";

  const toggleTab = (tab: ReportsTab) => {
    setSelectedTabs((current) =>
      current.includes(tab)
        ? current.filter((entry) => entry !== tab)
        : [...current, tab],
    );
  };

  const handleRate = async (postId: string, nextRating: number) => {
    try {
      const currentPost = completedPosts.find((post) => post.id === postId);
      if (!currentPost) {
        return;
      }

      setPostOverrides((current) => ({
        ...current,
        [postId]: {
          ...(current[postId] ?? {}),
          ...computeNextRatingState(currentPost, nextRating),
        },
      }));

      if (currentPost.viewer_rating) {
        await updateRating({ variables: { postId, rating: nextRating } });
      } else {
        await createRating({ variables: { postId, rating: nextRating } });
      }

      setPostOverrides((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
    } catch {
      setPostOverrides((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
      await refetchCompleted();
    }
  };

  const handleToggleBookmark = async (postId: string) => {
    const currentPost = completedPosts.find((post) => post.id === postId);
    if (!currentPost) {
      return;
    }

    setPostOverrides((current) => ({
      ...current,
      [postId]: {
        ...(current[postId] ?? {}),
        is_bookmarked: !currentPost.is_bookmarked,
        bookmark_count:
          currentPost.bookmark_count + (currentPost.is_bookmarked ? -1 : 1),
      },
    }));

    try {
      await toggleBookmark({ variables: { postId } });
      setPostOverrides((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
    } catch {
      setPostOverrides((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
      await refetchCompleted();
    }
  };

  const handleShare = async (postId: string) => {
    const shareUrl = `${window.location.origin}/reports/${postId}`;

    if (navigator.share) {
      await navigator.share({
        title: "Civic completion report",
        url: shareUrl,
      });
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
  };

  if (!hasAppliedScopeDefaults || isScopeLoading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(226,232,240,0.55),_transparent_42%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_42%,_#f8fafc_100%)]">
        <div className="mx-auto flex w-full max-w-6xl justify-center px-4 py-24 sm:px-6 lg:px-8">
          <LuLoaderCircle className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(226,232,240,0.55),_transparent_42%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_42%,_#f8fafc_100%)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="overflow-visible rounded-[2rem] border border-gray-200 bg-white shadow-sm shadow-gray-100/70">
          <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
                  Civic reports
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-gray-500">
                  Turn sections on and off to compare completed posts with active
                  report flow in one view.
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                <p className="font-medium text-gray-900">
                  {selectedLabels.length > 0
                    ? selectedLabels.join(" + ")
                    : "No sections selected"}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wider text-gray-400">
                  {totalVisible} total visible
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {tabOptions.map((option) => {
                const isActive = selectedTabs.includes(option.id);

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleTab(option.id)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-4 border-t border-gray-100 pt-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FilterDropdown
                  label="Ward"
                  valueLabel={wardLabel}
                  options={wardOptions}
                  onSelect={setWardId}
                />

                <FilterDropdown
                  label="Category"
                  valueLabel={categoryLabel}
                  options={categoryOptions}
                  onSelect={setCategory}
                />

                <div className="space-y-3">
                  {selectedTabs.includes("completed") ? (
                    <div className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                        Completion Sort
                      </span>
                      <div className="flex h-11 rounded-2xl bg-gray-100 p-1">
                        <button
                          type="button"
                          onClick={() => setCompletedSort("latest")}
                          className={`flex-1 rounded-xl px-3 text-sm font-medium transition-colors ${
                            completedSort === "latest"
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500"
                          }`}
                        >
                          Recent
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompletedSort("top_rated")}
                          className={`flex-1 rounded-xl px-3 text-sm font-medium transition-colors ${
                            completedSort === "top_rated"
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500"
                          }`}
                        >
                          Top Rated
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {selectedTabs.some((tab) => tab !== "completed") ? (
                    <div className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                        Task Sort
                      </span>
                      <div className="flex h-11 rounded-2xl bg-gray-100 p-1">
                        <button
                          type="button"
                          onClick={() => setTaskSort("recent")}
                          className={`flex-1 rounded-xl px-3 text-sm font-medium transition-colors ${
                            taskSort === "recent"
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500"
                          }`}
                        >
                          Recent
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskSort("most_upvoted")}
                          className={`flex-1 rounded-xl px-3 text-sm font-medium transition-colors ${
                            taskSort === "most_upvoted"
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500"
                          }`}
                        >
                          Most Upvoted
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl bg-gray-50 px-4 py-3 text-xs text-gray-500">
                Scope: {wardLabel}
              </div>
            </div>
          </div>
        </header>

        {selectedTabs.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
              <LuShieldAlert className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-gray-900">
              Select one or more sections
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Toggle Completed, Incoming, Escalated, or Invalid to build the
              mix of report sections you want to compare.
            </p>
          </div>
        ) : null}

        {selectedTabs.includes("completed") ? (
          <FeedSection
            title="Completed"
            subtitle="Public completion stories with ratings, comments, and before-and-after proof."
            count={completedPosts.length}
            loading={isCompletedLoading}
            emptyMessage="No completed reports match the current filters."
            footer={
              completedPageInfo.hasMore ? (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    disabled={isCompletedLoading}
                    onClick={() =>
                      void fetchMoreCompleted({
                        variables: {
                          ...completedVariables,
                          cursor: completedPageInfo.endCursor,
                        },
                        updateQuery: (previous, { fetchMoreResult }) => {
                          if (!fetchMoreResult) {
                            return previous;
                          }

                          return {
                            getReportFeed: mergeConnectionResults(
                              previous.getReportFeed,
                              fetchMoreResult.getReportFeed,
                            ),
                          };
                        },
                      })
                    }
                    className="h-11 rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
                  >
                    {isCompletedLoading ? "Loading..." : "Load more completions"}
                  </button>
                </div>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-5">
              {completedPosts.map((post) => (
                <ReportCard
                  key={post.id}
                  post={post}
                  onRate={(rating) => void handleRate(post.id, rating)}
                  onToggleBookmark={() => void handleToggleBookmark(post.id)}
                  onShare={() => void handleShare(post.id)}
                />
              ))}
            </div>
          </FeedSection>
        ) : null}

        {selectedTabs.includes("incoming") ? (
          <FeedSection
            title="Incoming"
            subtitle={
              user?.role === "municipality"
                ? "New escalations waiting for municipality action."
                : "Active reports still gathering support and moving through ward work."
            }
            count={incomingReports.length}
            loading={isIncomingLoading}
            emptyMessage={
              user?.role === "municipality"
                ? "No fresh escalations match the current filters."
                : "No incoming reports match the current filters."
            }
            footer={
              incomingPageInfo.hasMore ? (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    disabled={isIncomingLoading}
                    onClick={() =>
                      void fetchMoreIncoming({
                        variables: {
                          ...incomingVariables,
                          cursor: incomingPageInfo.endCursor,
                        },
                        updateQuery: (previous, { fetchMoreResult }) => {
                          if (!fetchMoreResult) {
                            return previous;
                          }

                          return {
                            getTaskReportFeed: mergeConnectionResults(
                              previous.getTaskReportFeed,
                              fetchMoreResult.getTaskReportFeed,
                            ),
                          };
                        },
                      })
                    }
                    className="h-11 rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
                  >
                    {isIncomingLoading ? "Loading..." : "Load more reports"}
                  </button>
                </div>
              ) : undefined
            }
          >
            <div className="grid gap-5 lg:grid-cols-2">
              {incomingReports.map((report) => (
                <TaskFeedCard key={report.id} report={report} />
              ))}
            </div>
          </FeedSection>
        ) : null}

        {selectedTabs.includes("escalated") ? (
          <FeedSection
            title="Escalated"
            subtitle={
              user?.role === "municipality"
                ? "Escalated reports already being handled or returned with instructions."
                : "Reports that left the ward workflow and now need municipality attention."
            }
            count={escalatedReports.length}
            loading={isEscalatedLoading}
            emptyMessage="No escalated reports match the current filters."
            footer={
              escalatedPageInfo.hasMore ? (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    disabled={isEscalatedLoading}
                    onClick={() =>
                      void fetchMoreEscalated({
                        variables: {
                          ...escalatedVariables,
                          cursor: escalatedPageInfo.endCursor,
                        },
                        updateQuery: (previous, { fetchMoreResult }) => {
                          if (!fetchMoreResult) {
                            return previous;
                          }

                          return {
                            getTaskReportFeed: mergeConnectionResults(
                              previous.getTaskReportFeed,
                              fetchMoreResult.getTaskReportFeed,
                            ),
                          };
                        },
                      })
                    }
                    className="h-11 rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
                  >
                    {isEscalatedLoading ? "Loading..." : "Load more reports"}
                  </button>
                </div>
              ) : undefined
            }
          >
            <div className="grid gap-5 lg:grid-cols-2">
              {escalatedReports.map((report) => (
                <TaskFeedCard key={report.id} report={report} />
              ))}
            </div>
          </FeedSection>
        ) : null}

        {selectedTabs.includes("invalid") ? (
          <FeedSection
            title="Invalid"
            subtitle="Reports that were closed with a recorded invalidation reason."
            count={invalidReports.length}
            loading={isInvalidLoading}
            emptyMessage="No invalid reports match the current filters."
            footer={
              invalidPageInfo.hasMore ? (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    disabled={isInvalidLoading}
                    onClick={() =>
                      void fetchMoreInvalid({
                        variables: {
                          ...invalidVariables,
                          cursor: invalidPageInfo.endCursor,
                        },
                        updateQuery: (previous, { fetchMoreResult }) => {
                          if (!fetchMoreResult) {
                            return previous;
                          }

                          return {
                            getTaskReportFeed: mergeConnectionResults(
                              previous.getTaskReportFeed,
                              fetchMoreResult.getTaskReportFeed,
                            ),
                          };
                        },
                      })
                    }
                    className="h-11 rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
                  >
                    {isInvalidLoading ? "Loading..." : "Load more reports"}
                  </button>
                </div>
              ) : undefined
            }
          >
            <div className="grid gap-5 lg:grid-cols-2">
              {invalidReports.map((report) => (
                <TaskFeedCard key={report.id} report={report} />
              ))}
            </div>
          </FeedSection>
        ) : null}
      </div>
    </div>
  );
}
