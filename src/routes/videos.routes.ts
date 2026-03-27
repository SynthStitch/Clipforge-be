import { Request, Response, Router } from "express";
import { firstQueryValue } from "../lib/request";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import * as videoService from "../services/video.service";

const router = Router();

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await videoService.getVideos({
      userId: req.user!.userId,
      formatTag: firstQueryValue(req.query.formatTag as string | string[] | undefined),
      search: firstQueryValue(req.query.search as string | string[] | undefined),
      tab: firstQueryValue(req.query.tab as string | string[] | undefined) as
        | "all"
        | "high_momentum"
        | "needs_attention"
        | undefined,
      page:
        parseInt(firstQueryValue(req.query.page as string | string[] | undefined) ?? "1", 10) || 1,
      limit:
        parseInt(firstQueryValue(req.query.limit as string | string[] | undefined) ?? "20", 10) ||
        20,
      sortBy: firstQueryValue(req.query.sortBy as string | string[] | undefined) as
        | "posted_at"
        | "views"
        | "engagement"
        | undefined,
      sortDir: firstQueryValue(req.query.sortDir as string | string[] | undefined) as
        | "asc"
        | "desc"
        | undefined,
    });
    res.json(data);
  }),
);

router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await videoService.getVideoById(req.user!.userId, String(req.params.id));
    if (!data) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.json(data);
  }),
);

export default router;
