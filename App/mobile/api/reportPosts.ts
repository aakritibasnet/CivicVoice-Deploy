import { api } from "@/lib/api";

export type ReportPost = {
  id: string;
  task_id: string;
  completion_id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  before_image_url: string | null;
  after_image_url: string;
  ward_name: string;
  ward_code?: string;
  completed_by_name: string;
  completed_by_role: string;
  rating_average: number;
  rating_count: number;
  comment_count: number;
  bookmark_count: number;
  edited_count: number;
  completed_at: string;
  created_at: string;
  viewer_rating: number | null;
  is_bookmarked: boolean;
  location_lat?: number | null;
  location_lng?: number | null;
  address_text?: string | null;
};

export type PostComment = {
  id: string;
  post_id: string;
  content: string;
  anonymous_name: string;
  reply_count: number;
  created_at: string;
  user_id?: string;
  user_name?: string;
  user_profile_image?: string | null;
};

export type FeedSort = "latest" | "top_rated" | "most_liked";

export type FeedResponse = {
  nodes: ReportPost[];
  pageInfo: { endCursor: string | null; hasMore: boolean };
};

export async function getReportPostsFeed(params?: {
  wardId?: string;
  category?: string;
  sort?: FeedSort;
  cursor?: string;
  limit?: number;
}): Promise<FeedResponse> {
  const res = await api.get<FeedResponse>("/report-posts/feed", {
    params: {
      wardId: params?.wardId,
      category: params?.category,
      sort: params?.sort || "latest",
      cursor: params?.cursor,
      limit: params?.limit || 12,
    },
  });
  return res.data;
}

export async function getReportPostDetail(postId: string): Promise<ReportPost> {
  const res = await api.get<ReportPost>(`/report-posts/${postId}`);
  return res.data;
}

export async function rateReportPost(postId: string, rating: number) {
  const res = await api.post(`/report-posts/${postId}/rate`, { rating });
  return res.data;
}

export async function toggleReportPostBookmark(postId: string) {
  const res = await api.post(`/report-posts/${postId}/bookmark`);
  return res.data;
}

export async function getReportPostComments(postId: string) {
  const res = await api.get<{ comments: PostComment[] }>(
    `/report-posts/${postId}/comments`,
  );
  return res.data.comments;
}

export async function addReportPostComment(postId: string, content: string) {
  const res = await api.post(`/report-posts/${postId}/comments`, { content });
  return res.data;
}

export async function getBookmarkedPosts(): Promise<ReportPost[]> {
  const res = await api.get<{ posts: ReportPost[] }>("/report-posts/bookmarked");
  return res.data.posts;
}
