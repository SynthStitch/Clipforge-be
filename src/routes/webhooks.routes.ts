import { Request, Response, Router } from "express";
import prisma from "../config/database";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { syncLimiter } from "../middleware/rateLimit";
import { invalidateMomentumCache } from "../lib/momentumCache";
import { AppError } from "../middleware/errorHandler";
import * as n8nService from "../services/n8n.service";

const router = Router();

// POST /api/sync/refresh — trigger Workflow 1 (Creator Intelligence)
router.post(
  "/refresh",
  authenticate,
  syncLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const account = await prisma.connectedAccount.findFirst({
      where: { userId: req.user!.userId, isActive: true, platform: "tiktok" },
    });

    if (!account) {
      throw new AppError(400, "No active TikTok account connected. Connect one in Settings.");
    }

    const result = await n8nService.triggerCreatorIntelligence(req.user!.userId, account.id);

    // Invalidate momentum cache so next dashboard load picks up fresh data
    invalidateMomentumCache(req.user!.userId);

    res.json({ message: "Sync started", ...result });
  }),
);

// POST /api/sync/generate — trigger Workflow 2 (Asset Generation)
router.post(
  "/generate",
  authenticate,
  syncLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { recommendationId } = req.body;

    const brief = await prisma.creativeBrief.findFirst({
      where: { userId: req.user!.userId, isCurrent: true },
      orderBy: { createdAt: "desc" },
    });

    if (!brief) {
      throw new AppError(400, "No creative brief found. Run a sync first.");
    }

    const result = await n8nService.triggerAssetGeneration(
      req.user!.userId,
      brief.id,
      recommendationId,
    );

    res.json({ message: "Asset generation started", ...result });
  }),
);

// GET /api/sync/status — latest ingestion log status
router.get(
  "/status",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const log = await prisma.ingestionLog.findFirst({
      where: { userId: req.user!.userId },
      orderBy: { startedAt: "desc" },
    });

    res.json({
      lastSync: log
        ? {
            status: log.status,
            runType: log.runType,
            videosFetched: log.videosFetched,
            commentsFetched: log.commentsFetched,
            entitiesExtracted: log.entitiesExtracted,
            startedAt: log.startedAt,
            completedAt: log.completedAt,
            errorMessage: log.errorMessage,
          }
        : null,
    });
  }),
);

export default router;
