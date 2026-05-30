import { gql } from "@apollo/client";

export const REPORT_WARD_INFO_FRAGMENT = gql`
  fragment ReportWardInfoFields on WardInfo {
    id
    name
    ward_code
  }
`;

export const REPORT_TASK_FRAGMENT = gql`
  ${REPORT_WARD_INFO_FRAGMENT}
  fragment ReportTaskFields on Task {
    id
    title
    description
    category
    priority
    status
    submitted_at
    before_image_url
    ward {
      ...ReportWardInfoFields
    }
  }
`;

export const TASK_COMPLETION_FRAGMENT = gql`
  fragment TaskCompletionFields on TaskCompletion {
    id
    task_id
    description
    before_image_url
    after_image_url
    completed_at
    completed_by_name
    completed_by_role
  }
`;

export const REPORT_POST_FRAGMENT = gql`
  ${REPORT_WARD_INFO_FRAGMENT}
  ${REPORT_TASK_FRAGMENT}
  ${TASK_COMPLETION_FRAGMENT}
  fragment ReportPostFields on ReportPost {
    id
    task_id
    completion_id
    ward_name
    completed_by_name
    completed_by_role
    title
    description
    category
    priority
    before_image_url
    after_image_url
    rating_average
    rating_count
    comment_count
    bookmark_count
    edited_count
    created_at
    updated_at
    completed_at
    is_reopened
    reopened_at
    reopened_reason
    reopened_by_name
    reopened_status
    viewer_rating
    is_bookmarked
    viewer_can_rate
    viewer_can_comment
    viewer_can_bookmark
    viewer_can_edit
    ward {
      ...ReportWardInfoFields
    }
    task {
      ...ReportTaskFields
    }
    completion {
      ...TaskCompletionFields
    }
  }
`;

export const PUBLIC_TASK_REPORT_FRAGMENT = gql`
  ${REPORT_WARD_INFO_FRAGMENT}
  fragment PublicTaskReportFields on PublicTaskReport {
    id
    title
    description
    category
    priority
    status
    upvote_count
    comment_count
    media_url
    photo_urls
    address_text
    submitted_at
    created_at
    updated_at
    ward_id
    assigned_level
    escalated_to_municipality
    escalated_at
    escalation_type
    returned_to_ward_at
    pathway_reason
    return_reasoning
    return_instructions
    ward {
      ...ReportWardInfoFields
    }
  }
`;

export const REPORT_COMMENT_FRAGMENT = gql`
  fragment ReportCommentLeafFields on Comment {
    id
    post_id
    parent_id
    content
    anonymous_name
    display_name
    author_role
    is_official
    reply_count
    created_at
    updated_at
    viewer_can_report
    viewer_can_reply
  }

  fragment ReportCommentLevel1Fields on Comment {
    ...ReportCommentLeafFields
    replies {
      ...ReportCommentLeafFields
    }
  }

  fragment ReportCommentLevel2Fields on Comment {
    ...ReportCommentLeafFields
    replies {
      ...ReportCommentLevel1Fields
    }
  }

  fragment ReportCommentLevel3Fields on Comment {
    ...ReportCommentLeafFields
    replies {
      ...ReportCommentLevel2Fields
    }
  }

  fragment ReportCommentLevel4Fields on Comment {
    ...ReportCommentLeafFields
    replies {
      ...ReportCommentLevel3Fields
    }
  }

  fragment ReportCommentFields on Comment {
    ...ReportCommentLeafFields
    replies {
      ...ReportCommentLevel4Fields
      replies {
        ...ReportCommentLevel3Fields
        replies {
          ...ReportCommentLevel2Fields
          replies {
            ...ReportCommentLevel1Fields
            replies {
              ...ReportCommentLeafFields
            }
          }
        }
      }
    }
  }
`;

export const GET_REPORT_FEED = gql`
  ${REPORT_POST_FRAGMENT}
  query GetReportFeed(
    $wardId: ID
    $category: String
    $cursor: String
    $limit: Int
    $sort: ReportFeedSort
  ) {
    getReportFeed(
      wardId: $wardId
      category: $category
      cursor: $cursor
      limit: $limit
      sort: $sort
    ) {
      nodes {
        ...ReportPostFields
      }
      pageInfo {
        endCursor
        hasMore
      }
    }
  }
`;

export const GET_REPORT_FEED_SCOPE = gql`
  query GetReportFeedScope {
    reportFeedScope {
      defaultWardId
      wardScopeLabel
      categories
      wards {
        id
        name
        ward_code
      }
    }
  }
`;

export const GET_TASK_REPORT_FEED = gql`
  ${PUBLIC_TASK_REPORT_FRAGMENT}
  query GetTaskReportFeed(
    $wardId: ID
    $category: String
    $cursor: String
    $limit: Int
    $sort: TaskReportFeedSort
    $statuses: [ReportStatus!]
    $escalated: Boolean
  ) {
    getTaskReportFeed(
      wardId: $wardId
      category: $category
      cursor: $cursor
      limit: $limit
      sort: $sort
      statuses: $statuses
      escalated: $escalated
    ) {
      nodes {
        ...PublicTaskReportFields
      }
      pageInfo {
        endCursor
        hasMore
      }
    }
  }
`;

export const GET_PUBLIC_TASK_REPORT = gql`
  ${PUBLIC_TASK_REPORT_FRAGMENT}
  query GetPublicTaskReport($reportId: ID!) {
    getPublicTaskReport(reportId: $reportId) {
      ...PublicTaskReportFields
    }
  }
`;

export const GET_REPORT_POST = gql`
  ${REPORT_POST_FRAGMENT}
  query GetReportPost($postId: ID!) {
    getReportPost(postId: $postId) {
      ...ReportPostFields
    }
  }
`;

export const GET_REPORT_COMMENTS = gql`
  ${REPORT_COMMENT_FRAGMENT}
  query GetReportComments($postId: ID!) {
    getComments(postId: $postId) {
      ...ReportCommentFields
    }
  }
`;

export const COMPLETE_TASK = gql`
  ${REPORT_POST_FRAGMENT}
  mutation CompleteTask(
    $taskId: ID!
    $afterImage: String!
    $description: String
  ) {
    completeTask(
      taskId: $taskId
      afterImage: $afterImage
      description: $description
    ) {
      ...ReportPostFields
    }
  }
`;

export const CREATE_RATING = gql`
  mutation CreateRating($postId: ID!, $rating: Int!) {
    createRating(postId: $postId, rating: $rating) {
      id
      post_id
      user_id
      rating
      created_at
      updated_at
    }
  }
`;

export const UPDATE_RATING = gql`
  mutation UpdateRating($postId: ID!, $rating: Int!) {
    updateRating(postId: $postId, rating: $rating) {
      id
      post_id
      user_id
      rating
      created_at
      updated_at
    }
  }
`;

export const ADD_COMMENT = gql`
  ${REPORT_COMMENT_FRAGMENT}
  mutation AddComment($postId: ID!, $content: String!, $parentId: ID) {
    addComment(postId: $postId, content: $content, parentId: $parentId) {
      ...ReportCommentFields
    }
  }
`;

export const REPORT_COMMENT = gql`
  mutation ReportComment($commentId: ID!, $reason: String!) {
    reportComment(commentId: $commentId, reason: $reason) {
      id
      comment_id
      user_id
      reason
      created_at
    }
  }
`;

export const TOGGLE_BOOKMARK = gql`
  mutation ToggleBookmark($postId: ID!) {
    toggleBookmark(postId: $postId) {
      post_id
      is_bookmarked
      bookmark_count
    }
  }
`;

export const EDIT_REPORT_POST = gql`
  ${REPORT_POST_FRAGMENT}
  mutation EditReportPost(
    $postId: ID!
    $description: String
    $afterImage: String
  ) {
    editReportPost(
      postId: $postId
      description: $description
      afterImage: $afterImage
    ) {
      ...ReportPostFields
    }
  }
`;
