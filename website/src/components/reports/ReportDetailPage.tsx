"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { LuArrowLeft, LuShare2 } from "react-icons/lu";
import Link from "next/link";
import {
  ADD_COMMENT,
  CREATE_RATING,
  EDIT_REPORT_POST,
  GET_REPORT_COMMENTS,
  GET_PUBLIC_TASK_REPORT,
  GET_REPORT_POST,
  REPORT_COMMENT,
  TOGGLE_BOOKMARK,
  UPDATE_RATING,
} from "@/src/graphql/operations/report-posts";
import type {
  AddCommentData,
  CreateRatingData,
  EditReportPostData,
  GetCommentsData,
  GetPublicTaskReportData,
  GetReportPostData,
  ReportComment as ReportCommentType,
  ReportPost,
  ReportCommentData,
  ToggleBookmarkData,
  UpdateRatingData,
} from "@/src/types/report-posts";
import { useAuthStore } from "@/src/store/auth-store";
import BeforeAfterSplit from "./BeforeAfterSplit";
import BookmarkButton from "./BookmarkButton";
import CommentThread from "./CommentThread";
import StarRatingInput from "./StarRatingInput";
import TaskCompletionDialog from "./TaskCompletionDialog";
import TaskReportDetailPage from "./TaskReportDetailPage";
import { Button } from "@/src/ui/Button";

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

function insertComment(
  comments: ReportCommentType[],
  nextComment: ReportCommentType,
  parentId: string | null,
): ReportCommentType[] {
  if (!parentId) {
    return [...comments, nextComment];
  }

  return comments.map((comment) => {
    const replies = Array.isArray(comment.replies) ? comment.replies : [];

    if (comment.id === parentId) {
      return {
        ...comment,
        reply_count: comment.reply_count + 1,
        replies: [...replies, nextComment],
      };
    }

    return {
      ...comment,
      replies: insertComment(replies, nextComment, parentId),
    };
  });
}

function normalizeCommentTree(comments: ReportCommentType[]): ReportCommentType[] {
  return comments.map((comment) => ({
    ...comment,
    replies: normalizeCommentTree(
      Array.isArray(comment.replies) ? comment.replies : [],
    ),
  }));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function formatWorkflowStatus(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getOfficialCommentDisplayName(user: {
  role: string;
  ward?: { ward_code: string } | null;
  ward_id?: string | null;
} | null) {
  if (!user) {
    return "You";
  }

  if (user.role === "ward") {
    return user.ward?.ward_code ? `${user.ward.ward_code} Office` : "Ward Office";
  }

  if (user.role === "officer") {
    if (user.ward?.ward_code || user.ward_id) {
      return user.ward?.ward_code ? `${user.ward.ward_code} Office` : "Ward Office";
    }

    return "Municipality Office";
  }

  if (user.role === "municipality") {
    return "Municipality Office";
  }

  if (user.role === "admin") {
    return "Administration Office";
  }

  return "You";
}

export default function ReportDetailPage({ postId }: { postId: string }) {
  const currentUser = useAuthStore((state) => state.user);
  const [postOverride, setPostOverride] = useState<Partial<ReportPost> | null>(null);
  const [optimisticComments, setOptimisticComments] = useState<ReportCommentType[] | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const {
    data: postData,
    loading: isPostLoading,
    refetch: refetchPost,
  } = useQuery<GetReportPostData>(GET_REPORT_POST, {
    variables: { postId },
  });

  const { data: publicTaskData, loading: isTaskLoading } =
    useQuery<GetPublicTaskReportData>(GET_PUBLIC_TASK_REPORT, {
      variables: { reportId: postId },
    });

  const { data: commentsData, refetch: refetchComments } = useQuery<GetCommentsData>(
    GET_REPORT_COMMENTS,
    {
      variables: { postId },
      skip: !postData?.getReportPost,
    },
  );

  const [createRating] = useMutation<CreateRatingData>(CREATE_RATING);
  const [updateRating] = useMutation<UpdateRatingData>(UPDATE_RATING);
  const [toggleBookmark] = useMutation<ToggleBookmarkData>(TOGGLE_BOOKMARK);
  const [addComment] = useMutation<AddCommentData>(ADD_COMMENT);
  const [reportComment] = useMutation<ReportCommentData>(REPORT_COMMENT);
  const [editReportPost] = useMutation<EditReportPostData>(EDIT_REPORT_POST);

  const post = postData?.getReportPost
    ? {
        ...postData.getReportPost,
        ...(postOverride ?? {}),
      }
    : null;

  const comments = normalizeCommentTree(
    optimisticComments ?? commentsData?.getComments ?? [],
  );
  const isOfficialCommenter =
    currentUser?.role === "ward" ||
    currentUser?.role === "municipality" ||
    currentUser?.role === "admin" ||
    currentUser?.role === "officer";
  const composerPlaceholder = isOfficialCommenter
    ? "Add a public office comment."
    : "Add a public comment. Your identity will be anonymized.";

  const handleRate = async (nextRating: number) => {
    if (!post) {
      return;
    }

    setPostOverride((current) => ({
      ...(current ?? {}),
      ...computeNextRatingState(post, nextRating),
    }));

    try {
      if (post.viewer_rating) {
        await updateRating({ variables: { postId: post.id, rating: nextRating } });
      } else {
        await createRating({ variables: { postId: post.id, rating: nextRating } });
      }
      setPostOverride(null);
    } catch {
      setPostOverride(null);
      await refetchPost();
    }
  };

  const handleToggleBookmark = async () => {
    if (!post) {
      return;
    }

    setPostOverride((current) => ({
      ...(current ?? {}),
      is_bookmarked: !post.is_bookmarked,
      bookmark_count: post.bookmark_count + (post.is_bookmarked ? -1 : 1),
    }));

    try {
      await toggleBookmark({ variables: { postId: post.id } });
      setPostOverride(null);
    } catch {
      setPostOverride(null);
      await refetchPost();
    }
  };

  const handleSubmitComment = async (content: string, parentId?: string | null) => {
    if (!post) {
      return;
    }

    const optimisticComment: ReportCommentType = {
      id: `temp-${Date.now()}`,
      post_id: post.id,
      parent_id: parentId ?? null,
      content,
      anonymous_name: "You",
      display_name: isOfficialCommenter
        ? getOfficialCommentDisplayName(currentUser)
        : "You",
      author_role: currentUser?.role ?? "citizen",
      is_official: isOfficialCommenter,
      reply_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      viewer_can_report: false,
      viewer_can_reply: true,
      replies: [],
    };

    setOptimisticComments((current) =>
      insertComment(current ?? commentsData?.getComments ?? [], optimisticComment, parentId ?? null),
    );
    setPostOverride((current) => ({
      ...(current ?? {}),
      comment_count: post.comment_count + 1,
    }));

    try {
      await addComment({
        variables: {
          postId: post.id,
          content,
          parentId: parentId ?? null,
        },
      });
      await Promise.all([refetchComments(), refetchPost()]);
      setOptimisticComments(null);
      setPostOverride(null);
    } catch {
      await Promise.all([refetchComments(), refetchPost()]);
      setOptimisticComments(null);
      setPostOverride(null);
    }
  };

  const handleReportComment = async (commentId: string, reason: string) => {
    await reportComment({
      variables: {
        commentId,
        reason,
      },
    });
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/reports/${postId}`;

    if (navigator.share) {
      await navigator.share({ title: post?.title ?? "Civic report", url: shareUrl });
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
  };

  if (isPostLoading && !post) {
    return (
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10">
        <div className="rounded-[28px] border border-gray-200 bg-white px-6 py-10 text-sm text-gray-500">
          Loading report...
        </div>
      </div>
    );
  }

  if (!post && publicTaskData?.getPublicTaskReport) {
    return <TaskReportDetailPage report={publicTaskData.getPublicTaskReport} />;
  }

  if (isTaskLoading && !post) {
    return (
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10">
        <div className="rounded-[28px] border border-gray-200 bg-white px-6 py-10 text-sm text-gray-500">
          Loading report...
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10">
        <div className="rounded-[28px] border border-dashed border-gray-300 bg-white px-6 py-10 text-sm text-gray-500">
          Report not found.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <LuArrowLeft />
            Back to reports
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <LuShare2 />
              Share
            </button>
            {post.viewer_can_edit ? (
              <Button variant="outline" onClick={() => setIsEditOpen(true)}>
                Edit post
              </Button>
            ) : null}
          </div>
        </div>

        <article className="space-y-6 rounded-[32px] border border-gray-200 bg-white p-6 shadow-[0_28px_100px_-60px_rgba(15,23,42,0.55)]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                {post.ward_name}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Completed by {post.completed_by_name}
              </span>
              {post.is_reopened ? (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                  Task Reopened
                </span>
              ) : null}
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-gray-950">
              {post.title}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-gray-600">
              {post.description ?? "No public description was added for this completion."}
            </p>
          </div>

          {post.is_reopened ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <p className="font-semibold">
                This task was reopened
                {post.reopened_by_name ? ` by ${post.reopened_by_name}` : ""}.
              </p>
              {post.reopened_at ? (
                <p className="mt-1 text-amber-800">
                  Reopened on {formatDate(post.reopened_at)}
                  {post.reopened_status
                    ? ` and moved back to ${formatWorkflowStatus(post.reopened_status)}.`
                    : "."}
                </p>
              ) : null}
              {post.reopened_reason ? (
                <p className="mt-2 leading-6 text-amber-900">{post.reopened_reason}</p>
              ) : null}
            </div>
          ) : null}

          <BeforeAfterSplit
            beforeImageUrl={post.before_image_url}
            afterImageUrl={post.after_image_url}
            title={post.title}
          />

          <div className="grid gap-6 rounded-[28px] border border-gray-200 bg-gray-50 p-5 md:grid-cols-[1.3fr_0.9fr]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <span>Completed on {formatDate(post.completed_at)}</span>
                <span>{post.category}</span>
                <span>{post.edited_count} edits</span>
              </div>

              <StarRatingInput
                value={post.viewer_rating}
                average={post.rating_average}
                count={post.rating_count}
                disabled={!post.viewer_can_rate}
                onRate={(rating) => void handleRate(rating)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-start gap-3 md:justify-end">
              <BookmarkButton
                active={post.is_bookmarked}
                count={post.bookmark_count}
                disabled={!post.viewer_can_bookmark}
                onToggle={() => void handleToggleBookmark()}
              />
              <div className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
                {post.comment_count} comments
              </div>
            </div>
          </div>
        </article>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-gray-950">Discussion</h2>
            <p className="text-sm text-gray-500">
              Comments are public. Citizen identities stay anonymous, while ward and municipality office comments are labeled clearly.
            </p>
          </div>
          <CommentThread
            comments={comments}
            canComment={post.viewer_can_comment}
            onSubmitComment={handleSubmitComment}
            onReportComment={handleReportComment}
            composerPlaceholder={composerPlaceholder}
          />
        </section>
      </div>

      <TaskCompletionDialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit report post"
        descriptionText="Update the public description or replace the completion image."
        submitLabel="Save changes"
        initialDescription={post.description}
        initialImageUrl={post.after_image_url}
        taskTitle={post.title}
        onSubmit={async ({ afterImageUrl, description }) => {
          const result = await editReportPost({
            variables: {
              postId: post.id,
              description,
              afterImage: afterImageUrl,
            },
          });

          if (result.data?.editReportPost) {
            setPostOverride(result.data.editReportPost);
          }
        }}
      />
    </div>
  );
}
