const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function uploadReportImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Images must be 5MB or smaller");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload/report-image", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as {
    secure_url?: string;
    error?: string;
  };

  if (!response.ok || !payload.secure_url) {
    throw new Error(payload.error ?? "Failed to upload image");
  }

  return payload.secure_url;
}
