import { Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import * as tiktokService from "../services/tiktok.service";

const router = Router();

const disconnectSchema = z.object({
  accountId: z.string().uuid(),
});

router.post("/tiktok", authenticate, async (req: Request, res: Response) => {
  const state = Buffer.from(JSON.stringify({ userId: req.user!.userId })).toString("base64url");
  const authUrl = tiktokService.getAuthorizationUrl(state);
  res.json({ authUrl });
});

router.get("/tiktok/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(`${env.frontendUrl}/dashboard/settings?error=oauth_denied`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${env.frontendUrl}/dashboard/settings?error=missing_params`);
    return;
  }

  try {
    const decoded = JSON.parse(Buffer.from(state as string, "base64url").toString());
    await tiktokService.connectAccount(decoded.userId, code as string);
    res.redirect(`${env.frontendUrl}/dashboard/settings?connected=tiktok`);
  } catch (err) {
    console.error("TikTok OAuth callback error:", err);
    res.redirect(`${env.frontendUrl}/dashboard/settings?error=oauth_failed`);
  }
});

router.post(
  "/tiktok/disconnect",
  authenticate,
  validate(disconnectSchema),
  async (req: Request, res: Response) => {
    const { accountId } = req.body;
    const result = await tiktokService.disconnectAccount(req.user!.userId, accountId);
    res.json(result);
  },
);

export default router;
