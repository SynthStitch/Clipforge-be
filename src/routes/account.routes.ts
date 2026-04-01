import { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { validate } from "../middleware/validate";
import * as accountService from "../services/account.service";

const router = Router();

const updateProfileSchema = z.object({
  fullName: z.string().optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

const privacySettingsSchema = z.object({
  privacyMode: z.enum(["strict", "balanced", "full"]).optional(),
  analyticsOptIn: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
  dataRetentionDays: z.number().int().min(7).max(365).optional(),
});

// GET /api/account/profile — user profile + connected accounts
router.get(
  "/profile",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await accountService.getProfile(req.user!.userId);
    res.json(data);
  }),
);

// PATCH /api/account/profile — update profile
router.patch(
  "/profile",
  authenticate,
  validate(updateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await accountService.updateProfile(req.user!.userId, req.body);
    res.json(data);
  }),
);

// POST /api/account/change-password
router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const result = await accountService.changePassword(
      req.user!.userId,
      currentPassword,
      newPassword,
    );
    res.json(result);
  }),
);

router.patch(
  "/privacy",
  authenticate,
  validate(privacySettingsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await accountService.updatePrivacySettings(req.user!.userId, req.body);
    res.json(data);
  }),
);

// GET /api/account/connected — list connected accounts
router.get(
  "/connected",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await accountService.getConnectedAccounts(req.user!.userId);
    res.json(data);
  }),
);

export default router;
