const reportPostsTypeDefs = `#graphql
  enum ReportFeedSort {
    latest
    top_rated
  }

  enum TaskReportFeedSort {
    recent
    most_upvoted
  }

  type Task {
    id: ID!
    title: String!
    description: String
    category: String!
    priority: PriorityLevel!
    status: ReportStatus!
    submitted_at: DateTime!
    before_image_url: String
    ward: WardInfo
  }

  type TaskCompletion {
    id: ID!
    task_id: ID!
    description: String
    before_image_url: String
    after_image_url: String!
    completed_at: DateTime!
    completed_by_name: String!
    completed_by_role: String!
  }

  type ReportPost {
    id: ID!
    task_id: ID!
    completion_id: ID!
    ward_name: String!
    completed_by_name: String!
    completed_by_role: String!
    title: String!
    description: String
    category: String!
    priority: PriorityLevel!
    before_image_url: String
    after_image_url: String!
    rating_average: Float!
    rating_count: Int!
    comment_count: Int!
    bookmark_count: Int!
    edited_count: Int!
    created_at: DateTime!
    updated_at: DateTime!
    completed_at: DateTime!
    is_reopened: Boolean!
    reopened_at: DateTime
    reopened_reason: String
    reopened_by_name: String
    reopened_status: ReportStatus
    viewer_rating: Int
    is_bookmarked: Boolean!
    viewer_can_rate: Boolean!
    viewer_can_comment: Boolean!
    viewer_can_bookmark: Boolean!
    viewer_can_edit: Boolean!
    ward: WardInfo
    task: Task!
    completion: TaskCompletion!
  }

  type Rating {
    id: ID!
    post_id: ID!
    user_id: ID!
    rating: Int!
    created_at: DateTime!
    updated_at: DateTime!
  }

  type Comment {
    id: ID!
    post_id: ID!
    parent_id: ID
    content: String!
    anonymous_name: String!
    display_name: String!
    author_role: String!
    is_official: Boolean!
    reply_count: Int!
    created_at: DateTime!
    updated_at: DateTime!
    viewer_can_report: Boolean!
    viewer_can_reply: Boolean!
    replies: [Comment!]!
  }

  type CommentReport {
    id: ID!
    comment_id: ID!
    user_id: ID!
    reason: String!
    created_at: DateTime!
  }

  type BookmarkToggleResult {
    post_id: ID!
    is_bookmarked: Boolean!
    bookmark_count: Int!
  }

  type ReportFeedPageInfo {
    endCursor: String
    hasMore: Boolean!
  }

  type ReportFeedConnection {
    nodes: [ReportPost!]!
    pageInfo: ReportFeedPageInfo!
  }

  type ReportFeedScope {
    wards: [WardInfo!]!
    categories: [String!]!
    defaultWardId: ID
    wardScopeLabel: String!
  }

  type PublicTaskReport {
    id: ID!
    title: String!
    description: String
    category: String!
    priority: PriorityLevel!
    status: ReportStatus!
    upvote_count: Int!
    comment_count: Int!
    media_url: String
    photo_urls: JSON
    address_text: String
    submitted_at: DateTime!
    created_at: DateTime!
    updated_at: DateTime!
    ward_id: ID
    assigned_level: AssignmentLevel!
    escalated_to_municipality: Boolean!
    escalated_at: DateTime
    escalation_type: String
    returned_to_ward_at: DateTime
    pathway_reason: String
    return_reasoning: String
    return_instructions: String
    ward: WardInfo
  }

  type TaskReportFeedConnection {
    nodes: [PublicTaskReport!]!
    pageInfo: ReportFeedPageInfo!
  }

  extend type Query {
    reportFeedScope: ReportFeedScope!
    getReportFeed(
      wardId: ID
      category: String
      cursor: String
      limit: Int
      sort: ReportFeedSort
    ): ReportFeedConnection!
    getTaskReportFeed(
      wardId: ID
      category: String
      cursor: String
      limit: Int
      sort: TaskReportFeedSort
      statuses: [ReportStatus!]
      escalated: Boolean
    ): TaskReportFeedConnection!
    getPublicTaskReport(reportId: ID!): PublicTaskReport
    getReportPost(postId: ID!): ReportPost
    getComments(postId: ID!): [Comment!]!
  }

  extend type Mutation {
    completeTask(taskId: ID!, afterImage: String!, description: String): ReportPost!
    createRating(postId: ID!, rating: Int!): Rating!
    updateRating(postId: ID!, rating: Int!): Rating!
    addComment(postId: ID!, content: String!, parentId: ID): Comment!
    reportComment(commentId: ID!, reason: String!): CommentReport!
    toggleBookmark(postId: ID!): BookmarkToggleResult!
    editReportPost(postId: ID!, description: String, afterImage: String): ReportPost!
  }
`;

export default reportPostsTypeDefs;
