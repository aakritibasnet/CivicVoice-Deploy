import { gql } from "@apollo/client";

export const ANALYTICS_SUMMARY_FRAGMENT = gql`
  fragment AnalyticsSummaryFields on AnalyticsSummary {
    total_reports
    pending_reports
    in_progress_reports
    completed_reports
    invalid_reports
    returned_reports
    completion_rate
    active_rate
    overdue_reports
    happiness_score
    happiness_penalty_total
    incoming_not_seen_count
    report_not_seen_escalation_count
    deadline_missed_escalation_count
    avg_resolution_hours
    window_created_reports
    window_completed_reports
  }
`;

export const ANALYTICS_TIMELINE_FRAGMENT = gql`
  fragment AnalyticsTimelineFields on AnalyticsTimelinePoint {
    date
    created_count
    completed_count
    in_progress_count
  }
`;

export const ANALYTICS_STATUS_FRAGMENT = gql`
  fragment AnalyticsStatusFields on AnalyticsStatusBreakdown {
    status
    count
    percentage
  }
`;

export const ANALYTICS_CATEGORY_FRAGMENT = gql`
  fragment AnalyticsCategoryFields on AnalyticsCategoryBreakdown {
    category
    count
    percentage
  }
`;

export const ANALYTICS_TOP_TASK_FRAGMENT = gql`
  fragment AnalyticsTopTaskFields on AnalyticsTopTask {
    id
    title
    category
    status
    upvote_count
    comment_count
    created_at
  }
`;

export const PUBLISHED_ANALYTICS_FRAGMENT = gql`
  ${ANALYTICS_SUMMARY_FRAGMENT}
  ${ANALYTICS_TIMELINE_FRAGMENT}
  ${ANALYTICS_STATUS_FRAGMENT}
  ${ANALYTICS_CATEGORY_FRAGMENT}
  ${ANALYTICS_TOP_TASK_FRAGMENT}
  fragment PublishedAnalyticsFields on PublishedAnalyticsReport {
    id
    title
    narrative
    auto_published
    period_days
    period_start
    period_end
    snapshot_date
    created_at
    summary {
      ...AnalyticsSummaryFields
    }
    timeline {
      ...AnalyticsTimelineFields
    }
    status_breakdown {
      ...AnalyticsStatusFields
    }
    category_breakdown {
      ...AnalyticsCategoryFields
    }
    top_upvoted_tasks {
      ...AnalyticsTopTaskFields
    }
  }
`;

export const GET_DASHBOARD_ANALYTICS = gql`
  ${ANALYTICS_SUMMARY_FRAGMENT}
  ${ANALYTICS_TIMELINE_FRAGMENT}
  ${ANALYTICS_STATUS_FRAGMENT}
  ${ANALYTICS_CATEGORY_FRAGMENT}
  ${ANALYTICS_TOP_TASK_FRAGMENT}
  ${PUBLISHED_ANALYTICS_FRAGMENT}
  query GetDashboardAnalytics($days: Int) {
    dashboardAnalytics(days: $days) {
      period_days
      generated_at
      summary {
        ...AnalyticsSummaryFields
      }
      timeline {
        ...AnalyticsTimelineFields
      }
      status_breakdown {
        ...AnalyticsStatusFields
      }
      category_breakdown {
        ...AnalyticsCategoryFields
      }
      top_upvoted_tasks {
        ...AnalyticsTopTaskFields
      }
      published_reports {
        ...PublishedAnalyticsFields
      }
    }
  }
`;

export const PUBLISH_ANALYTICS_REPORT = gql`
  ${PUBLISHED_ANALYTICS_FRAGMENT}
  mutation PublishAnalyticsReport($days: Int) {
    publishAnalyticsReport(days: $days) {
      ...PublishedAnalyticsFields
    }
  }
`;
