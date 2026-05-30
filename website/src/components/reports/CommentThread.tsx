"use client";

import { useState } from "react";
import { LuFlag, LuMessageSquareReply } from "react-icons/lu";
import type { ReportComment } from "@/src/types/report-posts";
import { Button } from "@/src/ui/Button";
import { Modal } from "@/src/ui/Modal";

interface CommentThreadProps {
  comments: ReportComment[];
  canComment: boolean;
  onSubmitComment: (content: string, parentId?: string | null) => Promise<void>;
  onReportComment: (commentId: string, reason: string) => Promise<void>;
  composerPlaceholder?: string;
}

interface CommentComposerProps {
  placeholder: string;
  onSubmit: (content: string) => Promise<void>;
  submitLabel: string;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function CommentComposer({
  placeholder,
  onSubmit,
  submitLabel,
}: CommentComposerProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="space-y-3">
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={4}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />
      <div className="flex justify-end">
        <Button
          disabled={isSubmitting || content.trim().length < 2}
          onClick={async () => {
            setIsSubmitting(true);
            try {
              await onSubmit(content.trim());
              setContent("");
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          {isSubmitting ? "Posting..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function ThreadItem({
  comment,
  canComment,
  onSubmitReply,
  onReportComment,
}: {
  comment: ReportComment;
  canComment: boolean;
  onSubmitReply: (content: string, parentId: string) => Promise<void>;
  onReportComment: (commentId: string, reason: string) => Promise<void>;
}) {
  const [isReplying, setIsReplying] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const replies = Array.isArray(comment.replies) ? comment.replies : [];
  const containerClassName = comment.is_official
    ? "border-sky-200 bg-sky-50/50"
    : "border-gray-200 bg-white";

  return (
    <div className={`space-y-4 rounded-2xl border p-4 ${containerClassName}`}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {comment.display_name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {comment.is_official ? (
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-medium text-sky-700">
                  Office comment
                </span>
              ) : null}
              <p className="text-xs text-gray-500">
                {formatTimestamp(comment.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canComment && comment.viewer_can_reply ? (
              <button
                type="button"
                onClick={() => setIsReplying((current) => !current)}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                <LuMessageSquareReply />
                Reply
              </button>
            ) : null}

            {comment.viewer_can_report ? (
              <button
                type="button"
                onClick={() => setIsReporting(true)}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <LuFlag />
                Report
              </button>
            ) : null}
          </div>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
          {comment.content}
        </p>
      </div>

      {isReplying ? (
        <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
          <CommentComposer
            placeholder="Write a reply..."
            submitLabel="Reply"
            onSubmit={async (content) => {
              await onSubmitReply(content, comment.id);
              setIsReplying(false);
            }}
          />
        </div>
      ) : null}

      {replies.length > 0 ? (
        <div className="space-y-3 border-l border-gray-200 pl-4">
          {replies.map((reply) => (
            <ThreadItem
              key={reply.id}
              comment={reply}
              canComment={canComment}
              onSubmitReply={onSubmitReply}
              onReportComment={onReportComment}
            />
          ))}
        </div>
      ) : null}

      <Modal isOpen={isReporting} onClose={() => setIsReporting(false)} size="md">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Report comment</h3>
            <p className="mt-1 text-sm text-gray-500">
              Add a short reason so moderators can review this comment.
            </p>
          </div>
          <textarea
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            placeholder="Reason for reporting..."
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsReporting(false)}>
              Cancel
            </Button>
            <Button
              disabled={reportReason.trim().length < 5}
              onClick={async () => {
                await onReportComment(comment.id, reportReason.trim());
                setReportReason("");
                setIsReporting(false);
              }}
            >
              Submit report
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function CommentThread({
  comments,
  canComment,
  onSubmitComment,
  onReportComment,
  composerPlaceholder = "Add a public comment.",
}: CommentThreadProps) {
  return (
    <div className="space-y-5">
      {canComment ? (
        <div className="rounded-[28px] border border-gray-200 bg-white p-5">
          <CommentComposer
            placeholder={composerPlaceholder}
            submitLabel="Post comment"
            onSubmit={(content) => onSubmitComment(content, null)}
          />
        </div>
      ) : null}

      <div className="space-y-4">
        {comments.map((comment) => (
          <ThreadItem
            key={comment.id}
            comment={comment}
            canComment={canComment}
            onSubmitReply={onSubmitComment}
            onReportComment={onReportComment}
          />
        ))}

        {comments.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
            No comments yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
