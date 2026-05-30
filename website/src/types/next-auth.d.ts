import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    ward_id: string | null;
    must_change_password: boolean;
    ward: {
      id: string;
      name: string;
      ward_code: string;
    } | null;
    accessToken: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      ward_id: string | null;
      must_change_password: boolean;
      ward: {
        id: string;
        name: string;
        ward_code: string;
      } | null;
    };
    accessToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    name: string;
    role: string;
    ward_id: string | null;
    must_change_password: boolean;
    ward: {
      id: string;
      name: string;
      ward_code: string;
    } | null;
    accessToken: string;
  }
}
