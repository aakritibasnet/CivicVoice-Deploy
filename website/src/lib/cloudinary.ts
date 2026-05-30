/**
 * Cloudinary Server-Side Upload Utility
 *
 * Server-side upload configuration for VoiceCivicFYP.
 * Use this for officer profiles, report photos, resolution proofs, etc.
 *
 * Required env vars:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */

import { v2 as cloudinary } from "cloudinary";

// ─── Server-Side Configuration ──────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

// ─── Types ───────────────────────────────────────────

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  resource_type: "image" | "video" | "raw";
}

export class CloudinaryUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudinaryUploadError";
  }
}

// ─── Server-Side Upload ──────────────────────────────

/**
 * Upload a buffer to Cloudinary (server-side only).
 *
 * @example
 * const result = await uploadBufferToCloudinary({
 *   buffer: imageBuffer,
 *   folder: "officer-profiles",
 *   resourceType: "image"
 * });
 */
export async function uploadBufferToCloudinary(params: {
  buffer: Buffer;
  folder: string;
  resourceType: "image" | "video";
}): Promise<CloudinaryUploadResult> {
  const { buffer, folder, resourceType } = params;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type as CloudinaryUploadResult["resource_type"],
        });
      },
    );

    stream.end(buffer);
  });
}

/**
 * Delete a file from Cloudinary (server-side only).
 */
export async function deleteFromCloudinary(publicId: string) {
  return cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}
