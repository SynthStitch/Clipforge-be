import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { authLimiter } from "../middleware/rateLimit";
import * as authService from "../services/auth.service";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, fullName } = req.body;
    const result = await authService.register(email, password, fullName);
    res.status(201).json(result);
  }),
);

router.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  }),
);

router.post(
  "/refresh",
  authenticate,
  authLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.refreshToken(req.user!.userId);
    res.json(result);
  }),
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.getCurrentUser(req.user!.userId);
    res.json({ user });
  }),
);

export default router;
