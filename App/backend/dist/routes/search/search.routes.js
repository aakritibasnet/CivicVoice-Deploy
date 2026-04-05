import { Router } from "express";
import { getPublicOfficerDetailController, searchDirectoryController, searchReportsController, } from "@/controllers/search/search.controller";
const searchRoutes = Router();
// Public search over public reports
searchRoutes.get("/reports", searchReportsController);
searchRoutes.get("/directory", searchDirectoryController);
searchRoutes.get("/officers/:officerId", getPublicOfficerDetailController);
export default searchRoutes;
