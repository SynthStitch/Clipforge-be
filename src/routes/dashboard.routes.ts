import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import * as dashboardService from "../services/dashboard.service";
import * as clipforgeDashboardService from "../services/clipforgeDashboard.service";

const router = Router();

// GET /api/dashboard — full dashboard overview
router.get(
  "/summary",
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await clipforgeDashboardService.getDashboardSummary();
    res.json(data);
  }),
);

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getDashboardOverview(req.user!.userId);
    res.json(data);
  }),
);

// GET /api/dashboard/metrics — just the 4 metric cards
router.get(
  "/metrics",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getDashboardMetrics(req.user!.userId);
    res.json(data);
  }),
);

// GET /api/dashboard/videos — recent videos (default 4)
router.get(
  "/videos",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 4, 1), 50);
    const data = await dashboardService.getRecentVideos(req.user!.userId, limit);
    res.json(data);
  }),
);

// GET /api/dashboard/format-insights — format performance cards
router.get(
  "/format-insights",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getFormatInsights(req.user!.userId);
    res.json(data);
  }),
);

// GET /api/dashboard/recommendations — top 3 recommendations
router.get(
  "/recommendations",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getActiveRecommendations(req.user!.userId, 3);
    res.json(data);
  }),
);

// GET /api/dashboard/charts — momentum + format chart data
router.get(
  "/charts",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await dashboardService.getMomentumChart(req.user!.userId);
    res.json(data);
  }),
);

export default router;
