import { gql } from "@apollo/client";

export const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        name
        email
        role
        ward_id
        municipality_id
        is_active
        must_change_password
        ward {
          id
          name
          ward_code
        }
      }
    }
  }
`;

export const ME_QUERY = gql`
  query Me {
    me {
      id
      name
      email
      role
      ward_id
      municipality_id
      is_active
      must_change_password
      ward {
        id
        name
        ward_code
      }
    }
  }
`;
