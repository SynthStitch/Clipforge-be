import { Request, Response, Router } from "express";
import { z } from "zod";
import { firstQueryValue } from "../lib/request";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import * as assetService from "../services/asset.service";

const router = Router();

const assetsQuerySchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).optional(),
  contentBranch: z.enum(["faceless_affiliate", "avatar_explainer", "product_demo_hybrid"]).optional(),
  assetType: z.enum(["script", "voiceover", "avatar_video", "visual_scene", "shot_list", "full_package"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const query = assetsQuerySchema.parse({
      status: firstQueryValue(req.query.status as string | string[] | undefined) || undefined,
      contentBranch: firstQueryValue(req.query.contentBranch as string | string[] | undefined) || undefined,
      assetType: firstQueryValue(req.query.assetType as string | string[] | undefined) || undefined,
      page: firstQueryValue(req.query.page as string | string[] | undefined) ?? "1",
      limit: firstQueryValue(req.query.limit as string | string[] | undefined) ?? "20",
    });
    const data = await assetService.getAssets({
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
    const data = await assetService.getAssetById(req.user!.userId, String(req.params.id));
    if (!data) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    res.json(data);
  }),
);

export default router;
