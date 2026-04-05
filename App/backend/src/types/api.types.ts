/**
 * Standardized API response format used across all controllers.
 */
export type ApiResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/**
 * Pagination metadata returned alongside paginated lists.
 */
export type PaginationMeta = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
};
