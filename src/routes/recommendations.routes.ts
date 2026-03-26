import { Request, Response, Router } from "express";
import { authenticate } from "../middleware/auth";
import * as recService from "../services/recommendation.service";

const router = Router();

router.get("/", authenticate, async (req: Request, res: Response) => {
  const data = await recService.getRecommendations(req.user!.userId);
  res.json(data);
});

router.post("/:id/dismiss", authenticate, async (req: Request, res: Response) => {
  const result = await recService.dismissRecommendation(req.user!.userId, String(req.params.id));
  if (!result) {
    res.status(404).json({ error: "Recommendation not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
