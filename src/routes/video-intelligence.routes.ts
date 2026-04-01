import { Request, Response, Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { firstQueryValue } from "../lib/request";
import { authenticate } from "../middleware/auth";
import * as transcriptService from "../services/transcript.service";

const router = Router();

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const niche = firstQueryValue(req.query.niche as string | string[] | undefined)?.slice(0, 255);
    const page = Math.min(Math.max(parseInt(firstQueryValue(req.query.page as string | string[] | undefined) ?? "1", 10) || 1, 1), 1000);
    const limit = Math.min(Math.max(parseInt(firstQueryValue(req.query.limit as string | string[] | undefined) ?? "20", 10) || 20, 1), 100);
    const data = await transcriptService.getVideoTranscripts({ niche, page, limit });
    res.json(data);
  }),
);

router.get(
  "/hooks",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const rawType = firstQueryValue(req.query.type as string | string[] | undefined);
    const validTypes = ["question", "bold_claim", "curiosity_gap", "demonstration", "pain_point", "story", "shock_value"];
    const type = rawType && validTypes.includes(rawType) ? rawType : undefined;
    const data = await transcriptService.getHookPatterns(type);
    res.json(data);
  }),
);

router.get(
  "/structures",
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await transcriptService.getStructureBreakdown();
    res.json(data);
  }),
);

router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await transcriptService.getVideoTranscriptById(String(req.params.id));
    if (!data) {
      res.status(404).json({ error: "Video transcript not found" });
      return;
    }
    res.json(data);
  }),
);

export default router;
