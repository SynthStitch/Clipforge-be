import { Request, Response, Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { authenticate } from "../middleware/auth";
import * as discoveryService from "../services/discovery.service";

const router = Router();

router.get(
  "/",
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await discoveryService.getDiscoveries();
    res.json(data);
  }),
);

router.get(
  "/recent",
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await discoveryService.getRecentDiscoveries();
    res.json(data);
  }),
);

router.get(
  "/desire-heatmap",
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await discoveryService.getDesireHeatmap();
    res.json(data);
  }),
);

router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await discoveryService.getDiscoveryById(String(req.params.id));
    if (!data) {
      res.status(404).json({ error: "Discovery not found" });
      return;
    }
    res.json(data);
  }),
);

export default router;
