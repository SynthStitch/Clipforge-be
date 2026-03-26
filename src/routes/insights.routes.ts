import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import * as insightsService from "../services/insights.service";

const router = Router();

// GET /api/insights — full insights page data
router.get("/", authenticate, async (req: Request, res: Response) => {
  const data = await insightsService.getInsights(req.user!.userId);
  res.json(data);
});

// GET /api/insights/brief — current creative brief
router.get("/brief", authenticate, async (req: Request, res: Response) => {
  const data = await insightsService.getCurrentBrief(req.user!.userId);
  if (!data) {
    res.status(404).json({ error: "No creative brief found. Run a sync first." });
    return;
  }
  res.json(data);
});

// GET /api/insights/demographics — audience demographics
router.get("/demographics", authenticate, async (req: Request, res: Response) => {
  const data = await insightsService.getAudienceDemographics(req.user!.userId);
  res.json(data);
});

export default router;
