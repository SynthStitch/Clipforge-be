import bcrypt from "bcryptjs";
import prisma from "../config/database";
import { AppError } from "../middleware/errorHandler";

export async function getProfile(userId: string) {
  const [user, privacyRows] = await Promise.all([
    prisma.user.findUnique({
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
    }),
    prisma.$queryRawUnsafe<Array<{
      privacy_mode: string;
      analytics_opt_in: boolean;
      marketing_opt_in: boolean;
      data_retention_days: number;
    }>>(
      `SELECT privacy_mode, analytics_opt_in, marketing_opt_in, data_retention_days
       FROM users
       WHERE id = $1::uuid
       LIMIT 1`,
      userId,
    ),
  ]);

  if (!user) throw new AppError(404, "User not found");
  const privacy = privacyRows[0];

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

  return {
    ...user,
    privacyMode: privacy?.privacy_mode ?? "balanced",
    analyticsOptIn: privacy?.analytics_opt_in ?? true,
    marketingOptIn: privacy?.marketing_opt_in ?? false,
    dataRetentionDays: privacy?.data_retention_days ?? 90,
    connectedAccounts,
  };
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

export async function updatePrivacySettings(
  userId: string,
  data: {
    privacyMode?: "strict" | "balanced" | "full";
    analyticsOptIn?: boolean;
    marketingOptIn?: boolean;
    dataRetentionDays?: number;
  },
) {
  const privacyMode = data.privacyMode ?? null;
  const analyticsOptIn = data.analyticsOptIn ?? null;
  const marketingOptIn = data.marketingOptIn ?? null;
  const dataRetentionDays = data.dataRetentionDays ?? null;

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    privacy_mode: string;
    analytics_opt_in: boolean;
    marketing_opt_in: boolean;
    data_retention_days: number;
    updated_at: Date;
  }>>(
    `UPDATE users
     SET privacy_mode = COALESCE($2, privacy_mode),
         analytics_opt_in = COALESCE($3, analytics_opt_in),
         marketing_opt_in = COALESCE($4, marketing_opt_in),
         data_retention_days = COALESCE($5, data_retention_days),
         updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING id, privacy_mode, analytics_opt_in, marketing_opt_in, data_retention_days, updated_at`,
    userId,
    privacyMode,
    analyticsOptIn,
    marketingOptIn,
    dataRetentionDays,
  );

  const row = rows[0];
  return {
    id: row.id,
    privacyMode: row.privacy_mode,
    analyticsOptIn: row.analytics_opt_in,
    marketingOptIn: row.marketing_opt_in,
    dataRetentionDays: row.data_retention_days,
    updatedAt: row.updated_at,
  };
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
