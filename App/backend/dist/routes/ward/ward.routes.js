import { Router } from "express";
import { listWardsController, listCategoriesController, detectWardFromCoords, getWardBoundariesController, getMunicipalityBoundariesController, } from "@/controllers/ward/ward.controller";
import { listDepartmentsController, createDepartmentController, listOfficersController, getOfficerDetailController, assignOfficerController, } from "@/controllers/ward/department.controller";
import { publishReportController, getPublishPreviewController, getPublishedReportsController, getPublishStatusController, getPublicPublishedReportController, getPublicPublishedFeedController, } from "@/controllers/ward/publish.controller";
import { requireAuth } from "@/middleware/auth";
import { requireWardUser } from "@/middleware/wardAuth";
const router = Router();
// Public routes
router.get("/", listWardsController);
router.get("/categories", listCategoriesController);
router.get("/detect", detectWardFromCoords);
router.get("/boundaries", getWardBoundariesController);
router.get("/municipality-boundaries", getMunicipalityBoundariesController);
// Public: list all published reports (feed for citizens)
router.get("/published-feed", getPublicPublishedFeedController);
// Public: get a published report by ID (human-readable)
router.get("/published/:reportId", getPublicPublishedReportController);
// Ward-authenticated routes
router.get("/departments", requireAuth, requireWardUser, listDepartmentsController);
router.post("/departments", requireAuth, requireWardUser, createDepartmentController);
router.get("/officers", requireAuth, requireWardUser, listOfficersController);
router.get("/officers/:officerId", requireAuth, requireWardUser, getOfficerDetailController);
router.post("/officers/assign", requireAuth, requireWardUser, assignOfficerController);
// Report publishing
router.get("/publish/status", requireAuth, requireWardUser, getPublishStatusController);
router.get("/publish/preview", requireAuth, requireWardUser, getPublishPreviewController);
router.post("/publish", requireAuth, requireWardUser, publishReportController);
router.get("/published", requireAuth, requireWardUser, getPublishedReportsController);
export default router;
