import { Request, Response, Router } from "express";
import prisma from "../config/database";
import { authenticate } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import * as n8nService from "../services/n8n.service";

const router = Router();

async function getActiveTikTokAccount(userId: string) {
  const account = await prisma.connectedAccount.findFirst({
    where: { userId, isActive: true, platform: "tiktok" },
  });

  if (!account) {
    throw new AppError(400, "No active TikTok account connected. Connect one in Settings.");
  }

  return account;
}

router.post("/refresh", authenticate, async (req: Request, res: Response) => {
  const account = await getActiveTikTokAccount(req.user!.userId);
  const result = await n8nService.triggerCreatorIntelligence(req.user!.userId, account.id);
  res.json({ message: "Sync started", ...result });
});

router.post("/", authenticate, async (req: Request, res: Response) => {
  const account = await getActiveTikTokAccount(req.user!.userId);
  const result = await n8nService.triggerCreatorIntelligence(req.user!.userId, account.id);
  res.json({ message: "Sync started", ...result });
});

router.post("/generate", authenticate, async (req: Request, res: Response) => {
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
});

router.get("/status", authenticate, async (req: Request, res: Response) => {
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
});

export default router;
