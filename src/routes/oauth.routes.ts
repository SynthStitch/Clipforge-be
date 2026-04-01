import { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { validate } from "../middleware/validate";
import { createOAuthState, consumeOAuthState } from "../lib/oauthState";
import { env } from "../config/env";
import * as tiktokService from "../services/tiktok.service";

const router = Router();

const disconnectSchema = z.object({
  accountId: z.string().uuid(),
});

// POST /api/oauth/tiktok — initiate TikTok OAuth flow
router.post(
  "/tiktok",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const state = await createOAuthState(req.user!.userId);
    const authUrl = tiktokService.getAuthorizationUrl(state);
    res.json({ authUrl });
  }),
);

// GET /api/oauth/tiktok/callback — handle TikTok OAuth callback
router.get(
  "/tiktok/callback",
  asyncHandler(async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      res.redirect(`${env.frontendUrl}/dashboard/settings?error=oauth_denied`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${env.frontendUrl}/dashboard/settings?error=missing_params`);
      return;
    }

    const userId = await consumeOAuthState(state as string);
    if (!userId) {
      res.redirect(`${env.frontendUrl}/dashboard/settings?error=invalid_state`);
      return;
    }

    try {
      await tiktokService.connectAccount(userId, code as string);
      res.redirect(`${env.frontendUrl}/dashboard/settings?connected=tiktok`);
    } catch (err) {
      console.error("TikTok OAuth callback error:", err);
      res.redirect(`${env.frontendUrl}/dashboard/settings?error=oauth_failed`);
    }
  }),
);

// POST /api/oauth/tiktok/disconnect
router.post(
  "/tiktok/disconnect",
  authenticate,
  validate(disconnectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { accountId } = req.body;
    const result = await tiktokService.disconnectAccount(req.user!.userId, accountId);
    res.json(result);
  }),
);

export default router;
