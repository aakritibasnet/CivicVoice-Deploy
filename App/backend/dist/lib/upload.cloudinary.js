import { v2 as cloudinary } from "cloudinary";
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
export async function uploadBufferToCloudinary(params) {
    const { buffer, folder, resourceType } = params;
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
            folder,
            resource_type: resourceType,
        }, (error, result) => {
            if (error || !result)
                return reject(error);
            resolve({
                secure_url: result.secure_url,
                public_id: result.public_id,
                resource_type: result.resource_type,
            });
        });
        stream.end(buffer);
    });
}
export async function deleteFromCloudinary(publicId) {
    // resource_type auto-detection is not perfect.
    // If you want safe delete, store resource_type in DB too.
    return cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}
/**
 * Private upload for chat attachments: type=authenticated means the asset
 * is NOT publicly reachable and can only be fetched via a signed URL. We
 * never hand the client a raw URL — the backend proxy signs + streams.
 */
export async function uploadPrivateToCloudinary(params) {
    const { buffer, folder, resourceType } = params;
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder, resource_type: resourceType, type: "authenticated" }, (error, result) => {
            if (error || !result)
                return reject(error);
            resolve({
                public_id: result.public_id,
                resource_type: result.resource_type,
            });
        });
        stream.end(buffer);
    });
}
/** Short-TTL signed URL for an authenticated asset (default 5 min). */
export function signedPrivateUrl(publicId, resourceType, opts) {
    const expiresAt = Math.floor(Date.now() / 1000) + (opts?.ttlSeconds ?? 300);
    return cloudinary.url(publicId, {
        type: "authenticated",
        resource_type: resourceType,
        secure: true,
        sign_url: true,
        expires_at: expiresAt,
        transformation: opts?.thumbnail && resourceType === "image"
            ? [{ width: 320, height: 320, crop: "limit" }]
            : undefined,
    });
}
export async function deletePrivateFromCloudinary(publicId, resourceType) {
    return cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        type: "authenticated",
    });
}
