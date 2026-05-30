import { gql } from "@apollo/client";

export const OFFICER_DEPARTMENT_FRAGMENT = gql`
  fragment OfficerDepartmentFields on OfficerDepartment {
    id
    slug
    name
    description
    created_at
    updated_at
  }
`;

export const OFFICER_PROFILE_FRAGMENT = gql`
  ${OFFICER_DEPARTMENT_FRAGMENT}
  fragment OfficerProfileFields on OfficerProfile {
    id
    first_name
    last_name
    email
    phone_number
    profile_image_url
    department_id
    type
    ward_id
    created_at
    updated_at
    must_change_password
    password_changed_at
    access_level
    department {
      ...OfficerDepartmentFields
    }
    ward {
      id
      name
      ward_code
    }
  }
`;

export const GET_OFFICER_DIRECTORY = gql`
  ${OFFICER_PROFILE_FRAGMENT}
  ${OFFICER_DEPARTMENT_FRAGMENT}
  query GetOfficerDirectory {
    officers {
      ...OfficerProfileFields
    }
    officerDepartments {
      ...OfficerDepartmentFields
    }
    wards {
      id
      name
      ward_code
    }
  }
`;

export const CREATE_OFFICER = gql`
  ${OFFICER_PROFILE_FRAGMENT}
  mutation CreateOfficer($input: CreateOfficerInput!) {
    createOfficer(input: $input) {
      officer {
        ...OfficerProfileFields
      }
      generated_credentials {
        email
        password
      }
    }
  }
`;

export const UPDATE_OFFICER = gql`
  ${OFFICER_PROFILE_FRAGMENT}
  mutation UpdateOfficer($id: ID!, $input: UpdateOfficerInput!) {
    updateOfficer(id: $id, input: $input) {
      ...OfficerProfileFields
    }
  }
`;

export const DELETE_OFFICER = gql`
  mutation DeleteOfficer($id: ID!) {
    deleteOfficer(id: $id)
  }
`;

export const RESET_OFFICER_PASSWORD = gql`
  ${OFFICER_PROFILE_FRAGMENT}
  mutation ResetOfficerPassword($id: ID!) {
    resetOfficerPassword(id: $id) {
      officer {
        ...OfficerProfileFields
      }
      temp_password
    }
  }
`;
