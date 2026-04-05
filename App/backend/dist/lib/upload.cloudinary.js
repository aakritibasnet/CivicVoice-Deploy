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
