import { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import * as recService from "../services/recommendation.service";

const router = Router();

const uuidParam = z.string().uuid();

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await recService.getRecommendations(req.user!.userId);
    res.json(data);
  }),
);

router.post(
  "/:id/dismiss",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const id = uuidParam.parse(req.params.id);
    const result = await recService.dismissRecommendation(req.user!.userId, id);
    if (!result) {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }
    res.json({ success: true });
  }),
);

export default router;
