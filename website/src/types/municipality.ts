export interface Municipality {
  id: string;
  name: string;
  name_ne: string | null;
  code: string;
  type: string;
  province_id: number | null;
  province_name: string | null;
  district: string | null;
  boundary_geojson: unknown;
  center_lat: number | null;
  center_lng: number | null;
  total_wards: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MunicipalitiesData {
  municipalities: Municipality[];
}

export interface MunicipalityData {
  municipality: Municipality | null;
}

export interface MunicipalityTransparencySummary {
  active_wards: number;
  total_reports: number;
  pending_reports: number;
  in_progress_reports: number;
  completed_reports: number;
  invalid_reports: number;
  returned_reports: number;
  escalated_reports: number;
  overdue_reports: number;
  average_happiness_score: number;
  total_upvotes: number;
  average_public_rating: number;
  total_ratings: number;
  published_post_count: number;
  ward_officer_count: number;
  municipality_officer_count: number;
}

export interface WardTransparencyOfficer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  department_name: string;
  assigned_report_count: number;
  active_report_count: number;
  completed_report_count: number;
}

export interface MunicipalityWardOverview {
  id: string;
  name: string;
  ward_code: string;
  contact_email: string | null;
  contact_phone: string | null;
  center_lat: number | null;
  center_lng: number | null;
  boundary_geojson: unknown;
  report_count: number;
  pending_reports: number;
  in_progress_reports: number;
  completed_reports: number;
  invalid_reports: number;
  returned_reports: number;
  escalated_reports: number;
  overdue_reports: number;
  happiness_score: number;
  happiness_penalty_total: number;
  incoming_not_seen_count: number;
  report_not_seen_escalation_count: number;
  deadline_missed_escalation_count: number;
  total_upvotes: number;
  average_public_rating: number;
  total_ratings: number;
  published_post_count: number;
  ward_officer_count: number;
  latest_activity_at: string | null;
  officers: WardTransparencyOfficer[];
}

export interface MunicipalityMapReport {
  id: string;
  title: string;
  category: string;
  status: "incoming" | "in_progress" | "completed" | "invalid" | "returned";
  priority: "low" | "medium" | "high" | "critical";
  ward_id: string;
  ward_name: string;
  ward_code: string;
  upvote_count: number;
  location_lat: number;
  location_lng: number;
  address_text: string | null;
  assigned_level: "ward" | "municipality";
  escalated_to_municipality: boolean;
  created_at: string;
  updated_at: string;
}

export interface MunicipalityTransparencyOverview {
  municipality: Municipality | null;
  summary: MunicipalityTransparencySummary;
  wards: MunicipalityWardOverview[];
  reports: MunicipalityMapReport[];
  municipality_boundary_geojson: unknown;
  generated_at: string;
}

export interface MunicipalityTransparencyData {
  municipalityTransparencyOverview: MunicipalityTransparencyOverview;
}
