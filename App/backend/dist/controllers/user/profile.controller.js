import { editFullNameService, updateProfileImageService, requestEmailChangeService, confirmEmailChangeService, getPublicProfileService, changePasswordService, } from "@/services/user/profile.service";
import { deleteAccountService } from "@/services/user/delete-account.service";
export async function editFullName(req, res, next) {
    try {
        const result = await editFullNameService(req.user, req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function updateProfileImage(req, res, next) {
    try {
        const result = await updateProfileImageService(req.user, req.file);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function requestEmailChange(req, res, next) {
    try {
        const result = await requestEmailChangeService(req.user, req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function confirmEmailChange(req, res, next) {
    try {
        const result = await confirmEmailChangeService(req.user, req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function getPublicProfile(req, res, next) {
    try {
        const result = await getPublicProfileService(req.params.userId);
        if (!result)
            return res.status(404).json({ message: "User not found" });
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function deleteAccount(req, res, next) {
    try {
        const result = await deleteAccountService(req.user, req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function changePassword(req, res, next) {
    try {
        const result = await changePasswordService(req.user, req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
