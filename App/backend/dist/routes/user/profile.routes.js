import { Router } from "express";
import multer from "multer";
import { requireAuth } from "@/middleware/auth";
import { uploadMemory } from "@/lib/upload.memory";
import { editFullName, updateProfileImage, requestEmailChange, confirmEmailChange, getPublicProfile, changePassword, } from "@/controllers/user/profile.controller";
import { deleteAccount } from "@/controllers/user/profile.controller";
const router = Router();
// Public route (no auth required)
router.get("/public/:userId", getPublicProfile);
// all profile routes require login
router.use(requireAuth);
// multer wrapper with size-limit error handling
const uploadProfileImage = (req, res, next) => {
    uploadMemory.single("image")(req, res, (err) => {
        if (!err)
            return next();
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ ok: false, message: "Image must be under 15 MB" });
        }
        return next(err);
    });
};
// edit profile basics
router.patch("/name", editFullName);
router.patch("/image", uploadProfileImage, updateProfileImage);
// email change (2 steps)
router.post("/email-change/request", requestEmailChange);
router.post("/email-change/confirm", confirmEmailChange);
router.post("/delete", deleteAccount);
router.post("/change-password", changePassword);
export default router;
