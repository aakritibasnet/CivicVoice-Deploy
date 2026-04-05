// src/types/express.d.ts
declare global {
  namespace Express {
    interface UserPayload {
      id: string;
      email: string;
      role: string;
      ward_id?: string | number | null;
    }

    interface Request {
      user?: UserPayload;
    }
  }
}

export {};
