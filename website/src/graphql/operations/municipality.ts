import { gql } from "@apollo/client";

export const GET_MUNICIPALITIES = gql`
  query GetMunicipalities($province_id: Int) {
    municipalities(province_id: $province_id) {
      id
      name
      name_ne
      code
      type
      province_id
      province_name
      district
      boundary_geojson
      center_lat
      center_lng
      total_wards
      is_active
    }
  }
`;

export const GET_MUNICIPALITY = gql`
  query GetMunicipality($id: ID, $code: String) {
    municipality(id: $id, code: $code) {
      id
      name
      name_ne
      code
      type
      province_id
      province_name
      district
      boundary_geojson
      center_lat
      center_lng
      total_wards
      is_active
      created_at
      updated_at
    }
  }
`;

export const GET_MUNICIPALITY_TRANSPARENCY = gql`
  query GetMunicipalityTransparency($municipality_id: ID) {
    municipalityTransparencyOverview(municipality_id: $municipality_id) {
      generated_at
      municipality_boundary_geojson
      municipality {
        id
        name
        name_ne
        code
        type
        province_name
        district
        total_wards
      }
      summary {
        active_wards
        total_reports
        pending_reports
        in_progress_reports
        completed_reports
        invalid_reports
        returned_reports
        escalated_reports
        overdue_reports
        average_happiness_score
        total_upvotes
        average_public_rating
        total_ratings
        published_post_count
        ward_officer_count
        municipality_officer_count
      }
      wards {
        id
        name
        ward_code
        contact_email
        contact_phone
        center_lat
        center_lng
        boundary_geojson
        report_count
        pending_reports
        in_progress_reports
        completed_reports
        invalid_reports
        returned_reports
        escalated_reports
        overdue_reports
        happiness_score
        happiness_penalty_total
        incoming_not_seen_count
        report_not_seen_escalation_count
        deadline_missed_escalation_count
        total_upvotes
        average_public_rating
        total_ratings
        published_post_count
        ward_officer_count
        latest_activity_at
        officers {
          id
          first_name
          last_name
          email
          phone_number
          department_name
          assigned_report_count
          active_report_count
          completed_report_count
        }
      }
      reports {
        id
        title
        category
        status
        priority
        ward_id
        ward_name
        ward_code
        upvote_count
        location_lat
        location_lng
        address_text
        assigned_level
        escalated_to_municipality
        created_at
        updated_at
      }
    }
  }
`;
