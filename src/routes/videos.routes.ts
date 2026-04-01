import { Request, Response, Router } from "express";
import { z } from "zod";
import { firstQueryValue } from "../lib/request";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import * as videoService from "../services/video.service";

const router = Router();

const videosQuerySchema = z.object({
  formatTag: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  tab: z.enum(["all", "high_momentum", "needs_attention"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["posted_at", "views", "engagement"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const query = videosQuerySchema.parse({
      formatTag: firstQueryValue(req.query.formatTag as string | string[] | undefined),
      search: firstQueryValue(req.query.search as string | string[] | undefined),
      tab: firstQueryValue(req.query.tab as string | string[] | undefined) || undefined,
      page: firstQueryValue(req.query.page as string | string[] | undefined) ?? "1",
      limit: firstQueryValue(req.query.limit as string | string[] | undefined) ?? "20",
      sortBy: firstQueryValue(req.query.sortBy as string | string[] | undefined) || undefined,
      sortDir: firstQueryValue(req.query.sortDir as string | string[] | undefined) || undefined,
    });
    const data = await videoService.getVideos({
      userId: req.user!.userId,
      ...query,
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
