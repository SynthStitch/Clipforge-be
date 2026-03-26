import { Request, Response, Router } from "express";
import { firstQueryValue } from "../lib/request";
import { authenticate } from "../middleware/auth";
import * as assetService from "../services/asset.service";

const router = Router();

router.get("/", authenticate, async (req: Request, res: Response) => {
  const data = await assetService.getAssets({
    userId: req.user!.userId,
    status: firstQueryValue(req.query.status as string | string[] | undefined),
    contentBranch: firstQueryValue(req.query.contentBranch as string | string[] | undefined),
    assetType: firstQueryValue(req.query.assetType as string | string[] | undefined),
    page: parseInt(firstQueryValue(req.query.page as string | string[] | undefined) ?? "1", 10) || 1,
    limit: parseInt(firstQueryValue(req.query.limit as string | string[] | undefined) ?? "20", 10) || 20,
  });
  res.json(data);
});

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  const data = await assetService.getAssetById(req.user!.userId, String(req.params.id));
  if (!data) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  res.json(data);
});

export default router;
