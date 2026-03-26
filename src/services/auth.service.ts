import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/database";
import { env } from "../config/env";
import { AuthPayload } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

export async function register(email: string, password: string, fullName?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "Email already registered");
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password: hashed, fullName },
    select: { id: true, email: true, fullName: true, plan: true, avatarUrl: true, createdAt: true },
  });

  const token = signToken({ userId: user.id, email: user.email });
  return { token, user };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, "Invalid credentials");
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new AppError(401, "Invalid credentials");
  }

  const token = signToken({ userId: user.id, email: user.email });
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      plan: user.plan,
      avatarUrl: user.avatarUrl,
    },
  };
}

export async function refreshToken(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, plan: true, avatarUrl: true },
  });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const token = signToken({ userId: user.id, email: user.email });
  return { token, user };
}

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}
