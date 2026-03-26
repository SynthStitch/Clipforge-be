import { Request, Response, Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
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

router.get("/", authenticate, async (req: Request, res: Response) => {
  const data = await accountService.getProfile(req.user!.userId);
  res.json(data);
});

router.get("/profile", authenticate, async (req: Request, res: Response) => {
  const data = await accountService.getProfile(req.user!.userId);
  res.json(data);
});

router.patch(
  "/profile",
  authenticate,
  validate(updateProfileSchema),
  async (req: Request, res: Response) => {
    const data = await accountService.updateProfile(req.user!.userId, req.body);
    res.json(data);
  },
);

router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const result = await accountService.changePassword(
      req.user!.userId,
      currentPassword,
      newPassword,
    );
    res.json(result);
  },
);

router.get("/connected", authenticate, async (req: Request, res: Response) => {
  const data = await accountService.getConnectedAccounts(req.user!.userId);
  res.json(data);
});

export default router;
