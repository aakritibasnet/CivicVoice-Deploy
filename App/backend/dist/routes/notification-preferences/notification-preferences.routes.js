import { Router } from "express";
import { requireAuth } from "@/middleware/auth";
import { getPreferencesController, updatePreferencesController, } from "@/controllers/notifications/preferences.controller";
const notificationPreferencesRoutes = Router();
notificationPreferencesRoutes.use(requireAuth);
notificationPreferencesRoutes.get("/", getPreferencesController);
notificationPreferencesRoutes.put("/", updatePreferencesController);
export default notificationPreferencesRoutes;
