import { Request, Response, Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { firstQueryValue } from "../lib/request";
import { authenticate } from "../middleware/auth";
import * as nicheService from "../services/niche.service";

const router = Router();

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.min(Math.max(parseInt(firstQueryValue(req.query.page as string | string[] | undefined) ?? "1", 10) || 1, 1), 1000);
    const limit = Math.min(Math.max(parseInt(firstQueryValue(req.query.limit as string | string[] | undefined) ?? "20", 10) || 20, 1), 100);
    const data = await nicheService.getLatestNiches({ page, limit });
    res.json(data);
  }),
);

router.get(
  "/opportunities",
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await nicheService.getOpportunities();
    res.json(data);
  }),
);

router.get(
  "/opportunities/:tier",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await nicheService.getOpportunities(String(req.params.tier));
    res.json(data);
  }),
);

router.get(
  "/:nicheName/history",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await nicheService.getNicheHistory(String(req.params.nicheName));
    res.json(data);
  }),
);

router.get(
  "/:nicheName",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await nicheService.getNicheByName(String(req.params.nicheName));
    if (!data) {
      res.status(404).json({ error: "Niche not found" });
      return;
    }
    res.json(data);
  }),
);

export default router;
