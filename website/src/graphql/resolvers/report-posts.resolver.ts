import type { GQLContext } from "../context";
import {
  addComment,
  completeTask,
  createRating,
  editReportPost,
  getComments,
  getReportFeed,
  getReportFeedScope,
  getPublicTaskReport,
  getReportPost,
  getTaskReportFeed,
  reportComment,
  toggleBookmark,
  updateRating,
} from "@/src/features/report-posts/server/service";

export const reportPostsResolvers = {
  Query: {
    reportFeedScope: async (
      _: unknown,
      __: unknown,
      { prisma, user }: GQLContext,
    ) => getReportFeedScope(prisma, user),

    getReportFeed: async (
      _: unknown,
      args: {
        wardId?: string | null;
        category?: string | null;
        cursor?: string | null;
        limit?: number | null;
        sort?: "latest" | "top_rated" | null;
      },
      { prisma, user }: GQLContext,
    ) => getReportFeed(prisma, user, args),

    getTaskReportFeed: async (
      _: unknown,
      args: {
        wardId?: string | null;
        category?: string | null;
        cursor?: string | null;
        limit?: number | null;
        sort?: "recent" | "most_upvoted" | null;
        statuses?: Array<
          "incoming" | "in_progress" | "completed" | "returned" | "invalid"
        > | null;
        escalated?: boolean | null;
      },
      { prisma, user }: GQLContext,
    ) => getTaskReportFeed(prisma, user, args),

    getReportPost: async (
      _: unknown,
      { postId }: { postId: string },
      { prisma, user }: GQLContext,
    ) => getReportPost(prisma, user, postId),

    getPublicTaskReport: async (
      _: unknown,
      { reportId }: { reportId: string },
      { prisma }: GQLContext,
    ) => getPublicTaskReport(prisma, reportId),

    getComments: async (
      _: unknown,
      { postId }: { postId: string },
      { prisma, user }: GQLContext,
    ) => getComments(prisma, user, postId),
  },

  Mutation: {
    completeTask: async (
      _: unknown,
      args: { taskId: string; afterImage: string; description?: string | null },
      { prisma, user }: GQLContext,
    ) => completeTask(prisma, user, args),

    createRating: async (
      _: unknown,
      args: { postId: string; rating: number },
      { prisma, user }: GQLContext,
    ) => createRating(prisma, user, args),

    updateRating: async (
      _: unknown,
      args: { postId: string; rating: number },
      { prisma, user }: GQLContext,
    ) => updateRating(prisma, user, args),

    addComment: async (
      _: unknown,
      args: { postId: string; content: string; parentId?: string | null },
      { prisma, user }: GQLContext,
    ) => addComment(prisma, user, args),

    reportComment: async (
      _: unknown,
      args: { commentId: string; reason: string },
      { prisma, user }: GQLContext,
    ) => reportComment(prisma, user, args),

    toggleBookmark: async (
      _: unknown,
      args: { postId: string },
      { prisma, user }: GQLContext,
    ) => toggleBookmark(prisma, user, args),

    editReportPost: async (
      _: unknown,
      args: { postId: string; description?: string | null; afterImage?: string | null },
      { prisma, user }: GQLContext,
    ) => editReportPost(prisma, user, args),
  },
};
