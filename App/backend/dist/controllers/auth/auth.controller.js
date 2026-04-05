import { signupService, verifyEmailService, loginService, refreshService, logoutService, meService, forgotPasswordService, resetPasswordService, } from "../../services/auth/auth.service.js";
export async function signup(req, res, next) {
    try {
        const result = await signupService(req.body);
        return res.status(201).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function verifyEmail(req, res, next) {
    try {
        const result = await verifyEmailService(req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function login(req, res, next) {
    try {
        const result = await loginService(req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function refresh(req, res, next) {
    try {
        const result = await refreshService(req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function logout(req, res, next) {
    try {
        const result = await logoutService(req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function me(req, res, next) {
    try {
        const result = await meService(req.user); // from requireAuth middleware
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function forgotPassword(req, res, next) {
    try {
        const result = await forgotPasswordService(req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function resetPassword(req, res, next) {
    try {
        const result = await resetPasswordService(req.body);
        return res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
}
