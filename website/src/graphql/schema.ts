import reportPostsTypeDefs from "./modules/report-posts.typeDefs";

const typeDefs = `#graphql

  scalar DateTime
  scalar JSON

  # ─── Enums ──────────────────────────────────────────
  enum UserRole {
    officer
    ward
    municipality
    admin
    citizen
  }

  enum OfficerType {
    ward_officer
    municipality_officer
  }

  enum OfficerAccessLevel {
    manageable
    read_only
  }

  enum ReportStatus {
    incoming
    in_progress
    completed
    returned
    invalid
  }

  enum AssignmentLevel {
    ward
    municipality
  }

  enum ReportWorkflowAction {
    mark_in_progress
    mark_completed
    mark_invalid
    escalate_to_municipality
    return_to_ward
  }

  enum PriorityLevel {
    low
    medium
    high
    critical
  }

  enum NotificationType {
    info
    success
    warning
    error
    report_assigned
  }

  # ─── Ward Type ──────────────────────────────────────
  type Ward {
    id: ID!
    name: String!
    ward_code: String!
    contact_email: String
    contact_phone: String
    default_deadline_days: Int!
    is_active: Boolean!
    created_at: DateTime!
    updated_at: DateTime!
    report_count: Int!
  }

  # ─── Municipality Type ──────────────────────────────
  type Municipality {
    id: ID!
    name: String!
    name_ne: String
    code: String!
    type: String!
    province_id: Int
    province_name: String
    district: String
    boundary_geojson: JSON
    center_lat: Float
    center_lng: Float
    total_wards: Int!
    is_active: Boolean!
    created_at: DateTime!
    updated_at: DateTime!
  }

  # ─── Auth Types ────────────────────────────────────
  type User {
    id: ID!
    name: String!
    email: String!
    role: UserRole!
    is_active: Boolean!
    ward_id: String
    municipality_id: String
    created_at: DateTime!
    last_login_at: DateTime
    must_change_password: Boolean!
    ward: Ward
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  # ─── Kanban Types ──────────────────────────────────
  type KanbanColumn {
    id: ID!
    name: String!
    position: Int!
    color: String!
    deadline_days: Int
    is_terminal: Boolean!
    is_default: Boolean!
    role_access: [UserRole!]!
    mapped_status: ReportStatus!
    created_at: DateTime!
    updated_at: DateTime!
    reports: [ReportCard!]!
    report_count: Int!
  }

  type KanbanUserPreferences {
    id: ID!
    user_id: ID!
    collapsed_columns: [ID!]!
    column_order: [ID!]
    created_at: DateTime!
    updated_at: DateTime!
  }

  type ReportCard {
    id: ID!
    title: String!
    description: String
    category: String!
    subcategory: String
    status: ReportStatus!
    priority: PriorityLevel!
    upvote_count: Int!
    comment_count: Int!
    is_public: Boolean!
    media_url: String
    photo_urls: JSON
    address_text: String
    location_lat: Float
    location_lng: Float
    submitted_at: DateTime!
    created_at: DateTime!
    updated_at: DateTime!
    incoming_seen_at: DateTime
    incoming_ack_deadline_at: DateTime
    ward_active_started_at: DateTime
    ward_deadline_at: DateTime
    ward_deadline_reason: String
    municipality_received_at: DateTime
    municipality_seen_at: DateTime
    municipality_deadline_at: DateTime
    estimated_completion_date: DateTime
    kanban_column_id: String
    ward_id: String
    assigned_level: AssignmentLevel!
    escalated_to_municipality: Boolean!
    escalated_at: DateTime
    escalation_type: String
    escalation_source: String
    returned_to_ward_at: DateTime
    pathway_reason: String
    return_reasoning: String
    return_instructions: String
    status_history: JSON
    resolution_description: String
    resolution_photo_urls: JSON
    assigned_department: OfficerDepartment
    assigned_officer: AssignedOfficer
    ward: WardInfo
    report_post: ReportPostSummary
  }

  type ReportPostSummary {
    id: ID!
    rating_average: Float!
    rating_count: Int!
    comment_count: Int!
    bookmark_count: Int!
    edited_count: Int!
    completed_at: DateTime!
    updated_at: DateTime!
  }

  type ReportTaskComment {
    id: ID!
    content: String!
    created_at: DateTime!
    commenter_name: String!
    commenter_id: ID
    is_anonymous: Boolean!
  }

  type AssignedOfficer {
    id: ID!
    name: String!
    email: String
    phone_number: String
    type: OfficerType!
    department: OfficerDepartment!
  }

  type WardInfo {
    id: ID!
    name: String!
    ward_code: String!
  }

  type OfficerDepartment {
    id: ID!
    slug: String!
    name: String!
    description: String
    created_at: DateTime!
    updated_at: DateTime!
  }

  type OfficerProfile {
    id: ID!
    first_name: String!
    last_name: String!
    email: String
    phone_number: String
    profile_image_url: String
    department_id: String!
    type: OfficerType!
    ward_id: String
    created_at: DateTime!
    updated_at: DateTime!
    must_change_password: Boolean!
    password_changed_at: DateTime
    access_level: OfficerAccessLevel!
    department: OfficerDepartment!
    ward: WardInfo
  }

  type OfficerGeneratedCredentials {
    email: String!
    password: String!
  }

  type CreateOfficerPayload {
    officer: OfficerProfile!
    generated_credentials: OfficerGeneratedCredentials
  }

  type ResetOfficerPasswordPayload {
    officer: OfficerProfile!
    temp_password: String!
  }

  type Notification {
    id: ID!
    user_id: ID!
    report_id: ID
    title: String!
    message: String!
    type: String!
    link: String
    metadata: JSON
    is_read: Boolean!
    created_at: DateTime!
  }

  type AnalyticsSummary {
    total_reports: Int!
    pending_reports: Int!
    in_progress_reports: Int!
    completed_reports: Int!
    invalid_reports: Int!
    returned_reports: Int!
    completion_rate: Float!
    active_rate: Float!
    overdue_reports: Int!
    happiness_score: Float!
    happiness_penalty_total: Int!
    incoming_not_seen_count: Int!
    report_not_seen_escalation_count: Int!
    deadline_missed_escalation_count: Int!
    avg_resolution_hours: Float!
    window_created_reports: Int!
    window_completed_reports: Int!
  }

  type AnalyticsTimelinePoint {
    date: String!
    created_count: Int!
    completed_count: Int!
    in_progress_count: Int!
  }

  type AnalyticsStatusBreakdown {
    status: ReportStatus!
    count: Int!
    percentage: Float!
  }

  type AnalyticsCategoryBreakdown {
    category: String!
    count: Int!
    percentage: Float!
  }

  type AnalyticsTopTask {
    id: ID!
    title: String!
    category: String!
    status: ReportStatus!
    upvote_count: Int!
    comment_count: Int!
    created_at: DateTime!
  }

  type PublishedAnalyticsReport {
    id: ID!
    title: String!
    narrative: String!
    auto_published: Boolean!
    period_days: Int!
    period_start: DateTime!
    period_end: DateTime!
    snapshot_date: DateTime!
    created_at: DateTime!
    summary: AnalyticsSummary!
    timeline: [AnalyticsTimelinePoint!]!
    status_breakdown: [AnalyticsStatusBreakdown!]!
    category_breakdown: [AnalyticsCategoryBreakdown!]!
    top_upvoted_tasks: [AnalyticsTopTask!]!
  }

  type DashboardAnalytics {
    summary: AnalyticsSummary!
    timeline: [AnalyticsTimelinePoint!]!
    status_breakdown: [AnalyticsStatusBreakdown!]!
    category_breakdown: [AnalyticsCategoryBreakdown!]!
    top_upvoted_tasks: [AnalyticsTopTask!]!
    published_reports: [PublishedAnalyticsReport!]!
    period_days: Int!
    generated_at: DateTime!
  }

  type MunicipalityTransparencySummary {
    active_wards: Int!
    total_reports: Int!
    pending_reports: Int!
    in_progress_reports: Int!
    completed_reports: Int!
    invalid_reports: Int!
    returned_reports: Int!
    escalated_reports: Int!
    overdue_reports: Int!
    average_happiness_score: Float!
    total_upvotes: Int!
    average_public_rating: Float!
    total_ratings: Int!
    published_post_count: Int!
    ward_officer_count: Int!
    municipality_officer_count: Int!
  }

  type WardTransparencyOfficer {
    id: ID!
    first_name: String!
    last_name: String!
    email: String
    phone_number: String
    department_name: String!
    assigned_report_count: Int!
    active_report_count: Int!
    completed_report_count: Int!
  }

  type MunicipalityWardOverview {
    id: ID!
    name: String!
    ward_code: String!
    contact_email: String
    contact_phone: String
    center_lat: Float
    center_lng: Float
    boundary_geojson: JSON
    report_count: Int!
    pending_reports: Int!
    in_progress_reports: Int!
    completed_reports: Int!
    invalid_reports: Int!
    returned_reports: Int!
    escalated_reports: Int!
    overdue_reports: Int!
    happiness_score: Float!
    happiness_penalty_total: Int!
    incoming_not_seen_count: Int!
    report_not_seen_escalation_count: Int!
    deadline_missed_escalation_count: Int!
    total_upvotes: Int!
    average_public_rating: Float!
    total_ratings: Int!
    published_post_count: Int!
    ward_officer_count: Int!
    latest_activity_at: DateTime
    officers: [WardTransparencyOfficer!]!
  }

  type MunicipalityMapReport {
    id: ID!
    title: String!
    category: String!
    status: ReportStatus!
    priority: PriorityLevel!
    ward_id: String!
    ward_name: String!
    ward_code: String!
    upvote_count: Int!
    location_lat: Float!
    location_lng: Float!
    address_text: String
    assigned_level: AssignmentLevel!
    escalated_to_municipality: Boolean!
    created_at: DateTime!
    updated_at: DateTime!
  }

  type MunicipalityTransparencyOverview {
    municipality: Municipality
    summary: MunicipalityTransparencySummary!
    wards: [MunicipalityWardOverview!]!
    reports: [MunicipalityMapReport!]!
    municipality_boundary_geojson: JSON
    generated_at: DateTime!
  }

  # ─── Inputs ────────────────────────────────────────
  input CreateColumnInput {
    name: String!
    position: Int!
    color: String
    deadline_days: Int
    is_terminal: Boolean
    is_default: Boolean
    role_access: [UserRole!]
    mapped_status: ReportStatus!
  }

  input UpdateColumnInput {
    name: String
    position: Int
    color: String
    deadline_days: Int
    is_terminal: Boolean
    mapped_status: ReportStatus
  }

  input UpdatePreferencesInput {
    collapsed_columns: [ID!]!
    column_order: [ID!]
  }

  input ResolutionInput {
    reason: String!
    proof_image_urls: [String!]
  }

  input ReportWorkflowActionInput {
    reason: String
    instructions: String
    deadline_at: DateTime
    proof_image_urls: [String!]
  }

  input UpdateReportDeadlineInput {
    deadline_at: DateTime!
    reason: String
  }

  input CreateOfficerInput {
    first_name: String!
    last_name: String!
    phone_number: String
    profile_image_url: String
    department_id: ID!
    type: OfficerType!
    ward_id: ID
  }

  input UpdateOfficerInput {
    first_name: String
    last_name: String
    email: String
    phone_number: String
    profile_image_url: String
    department_id: ID
    type: OfficerType
    ward_id: ID
  }

  input AssignReportInput {
    department_id: ID
    officer_id: ID
    priority: PriorityLevel!
  }

  # ─── Queries ───────────────────────────────────────
  type Query {
    me: User
    kanbanBoard: [KanbanColumn!]!
    kanbanColumn(id: ID!): KanbanColumn
    kanbanUserPreferences: KanbanUserPreferences
    reportComments(reportId: ID!, limit: Int = 20): [ReportTaskComment!]!
    dashboardAnalytics(days: Int = 7): DashboardAnalytics!
    municipalities(province_id: Int): [Municipality!]!
    municipality(id: ID, code: String): Municipality
    municipalityTransparencyOverview(municipality_id: ID): MunicipalityTransparencyOverview!
    wards: [Ward!]!
    officers: [OfficerProfile!]!
    officerDepartments: [OfficerDepartment!]!
    notifications: [Notification!]!
    unreadNotificationCount: Int!
  }

  # ─── Mutations ─────────────────────────────────────
  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!

    createKanbanColumn(input: CreateColumnInput!): KanbanColumn!
    updateKanbanColumn(id: ID!, input: UpdateColumnInput!): KanbanColumn!
    deleteKanbanColumn(id: ID!): Boolean!
    reorderKanbanColumns(columnIds: [ID!]!): [KanbanColumn!]!

    moveReport(reportId: ID!, columnId: ID!): ReportCard!
    moveReportWithResolution(reportId: ID!, columnId: ID!, resolution: ResolutionInput!): ReportCard!
    applyReportWorkflowAction(reportId: ID!, action: ReportWorkflowAction!, input: ReportWorkflowActionInput): ReportCard!
    markReportSeen(reportId: ID!): ReportCard!
    updateReportDeadline(reportId: ID!, input: UpdateReportDeadlineInput!): ReportCard!

    publishAnalyticsReport(days: Int = 7): PublishedAnalyticsReport!

    updateKanbanPreferences(input: UpdatePreferencesInput!): KanbanUserPreferences!
    toggleColumnCollapse(columnId: ID!): KanbanUserPreferences!

    createOfficer(input: CreateOfficerInput!): CreateOfficerPayload!
    updateOfficer(id: ID!, input: UpdateOfficerInput!): OfficerProfile!
    deleteOfficer(id: ID!): Boolean!
    resetOfficerPassword(id: ID!): ResetOfficerPasswordPayload!
    assignReport(reportId: ID!, input: AssignReportInput!): ReportCard!
    unassignReport(reportId: ID!): ReportCard!

    markNotificationAsRead(id: ID!): Notification!
    markAllNotificationsAsRead: Boolean!
    deleteNotification(id: ID!): Boolean!
  }
`;

const mergedTypeDefs = `${typeDefs}\n${reportPostsTypeDefs}`;

export default mergedTypeDefs;
