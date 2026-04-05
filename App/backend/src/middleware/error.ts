import type { ErrorRequestHandler } from "express";

type AppError = Error & {
  status?: number;
};

export const errorHandler: ErrorRequestHandler = (err: AppError, _req, res, _next) => {
  console.error(err);

  const status = err.status ?? 500;

  res.status(status).json({
    message: err.message || "Internal Server Error",
  });
};
