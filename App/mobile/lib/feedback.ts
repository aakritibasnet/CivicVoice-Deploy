type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

function getMessageCandidate(error: any): string {
  const data = error?.response?.data;
  return (
    data?.message ||
    data?.error ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

export function getFriendlyErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  const raw = String(getMessageCandidate(error) || fallback).trim();
  const message = raw || fallback;
  const lower = message.toLowerCase();

  if (
    lower.includes("network error") ||
    lower.includes("timeout") ||
    lower.includes("failed to fetch")
  ) {
    return "We couldn't reach the server. Check your connection and try again.";
  }

  if (
    lower.includes("invalid credentials") ||
    lower.includes("incorrect password") ||
    lower.includes("wrong password")
  ) {
    return "Incorrect email or password.";
  }

  if (
    lower.includes("email already") ||
    lower.includes("already exists") ||
    lower.includes("already registered")
  ) {
    return "That email is already in use.";
  }

  if (lower.includes("invalid code") || lower.includes("expired code")) {
    return "That code is invalid or has expired. Please request a new one.";
  }

  if (lower === "no access token" || lower.includes("login required")) {
    return "Please log in and try again.";
  }

  if (
    lower.includes("cannot upvote your own report") ||
    lower.includes("can't upvote your own report")
  ) {
    return "Cannot upvote your own report.";
  }

  if (lower.includes("already upvoted")) {
    return "You have already upvoted this report.";
  }

  if (lower.includes("task not assigned to you")) {
    return "This task is no longer assigned to you.";
  }

  if (
    lower.includes("already assigned") &&
    (lower.includes("unassign") || lower.includes("owner"))
  ) {
    return "This task already has an owner. Unassign it first to change assignment.";
  }

  if (
    lower.includes("cannot complete task without uploading proof") ||
    lower.includes("uploading proof")
  ) {
    return "Upload at least one proof image before completing this task.";
  }

  if (
    lower.includes("report not found") ||
    lower.includes("task not found") ||
    lower.includes("post not found")
  ) {
    return "We couldn't find that item anymore.";
  }

  if (lower.includes("camera permission")) {
    return "Please allow camera access and try again.";
  }

  if (lower.includes("photo library") || lower.includes("media library")) {
    return "Please allow photo library access and try again.";
  }

  if (
    lower.includes("violates foreign key constraint") ||
    lower.includes("operator does not exist") ||
    lower.includes("request failed with status code 500") ||
    lower.includes("prismaclient") ||
    lower.includes("sql")
  ) {
    return "Something went wrong on our side. Please try again.";
  }

  return message;
}

export function normalizeErrorMessage<T>(error: T, fallback?: string): T {
  const message = getFriendlyErrorMessage(error, fallback);

  if (error && typeof error === "object") {
    const candidate = error as {
      message?: string;
      response?: {
        data?: {
          message?: string;
          error?: string;
        };
      };
    };

    candidate.message = message;

    if (candidate.response?.data) {
      candidate.response.data.message = message;
      candidate.response.data.error = message;
    }

    return error;
  }

  return new Error(message) as T;
}

export function getFieldErrors<T extends string = string>(
  error: unknown,
  allowedFields: T[],
): FieldErrors<T> {
  const result: FieldErrors<T> = {};
  const data = (error as any)?.response?.data;

  if (data?.errors && typeof data.errors === "object") {
    for (const field of allowedFields) {
      const candidate = data.errors[field];
      if (typeof candidate === "string") {
        result[field] = candidate;
      } else if (Array.isArray(candidate) && typeof candidate[0] === "string") {
        result[field] = candidate[0];
      }
    }
    return result;
  }

  const message = getFriendlyErrorMessage(error, "");
  const lower = message.toLowerCase();

  for (const field of allowedFields) {
    if (lower.includes(field.toLowerCase())) {
      result[field] = message;
    }
  }

  if (!Object.keys(result).length) {
    if (
      allowedFields.includes("email" as T) &&
      (lower.includes("credentials") || lower.includes("account"))
    ) {
      result["email" as T] = message as FieldErrors<T>[T];
    }

    if (
      allowedFields.includes("password" as T) &&
      (lower.includes("credentials") || lower.includes("password"))
    ) {
      result["password" as T] = message as FieldErrors<T>[T];
    }

    if (allowedFields.includes("code" as T) && lower.includes("code")) {
      result["code" as T] = message as FieldErrors<T>[T];
    }
  }

  return result;
}
