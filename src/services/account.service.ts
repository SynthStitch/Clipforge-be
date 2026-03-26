import bcrypt from "bcryptjs";
import prisma from "../config/database";
import { AppError } from "../middleware/errorHandler";

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      plan: true,
      onboardedAt: true,
      createdAt: true,
    },
  });

  if (!user) throw new AppError(404, "User not found");

  const connectedAccounts = await prisma.connectedAccount.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      platform: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isActive: true,
      connectedAt: true,
    },
  });

  return { ...user, connectedAccounts };
}

export async function updateProfile(
  userId: string,
  data: { fullName?: string; email?: string; avatarUrl?: string },
) {
  if (data.email) {
    const existing = await prisma.user.findFirst({
      where: { email: data.email, NOT: { id: userId } },
    });
    if (existing) throw new AppError(409, "Email already in use");
  }

  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      plan: true,
    },
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User not found");

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new AppError(401, "Current password is incorrect");

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  });

  return { success: true };
}

export async function getConnectedAccounts(userId: string) {
  return prisma.connectedAccount.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      platform: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isActive: true,
      connectedAt: true,
    },
  });
}
