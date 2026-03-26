import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
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

router.post("/register", validate(registerSchema), async (req: Request, res: Response) => {
  const { email, password, fullName } = req.body;
  const result = await authService.register(email, password, fullName);
  res.status(201).json(result);
});

router.post("/login", validate(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  res.json(result);
});

router.post("/refresh", authenticate, async (req: Request, res: Response) => {
  const result = await authService.refreshToken(req.user!.userId);
  res.json(result);
});

export default router;
