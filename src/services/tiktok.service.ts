import prisma from "../config/database";
import { env } from "../config/env";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { AppError } from "../middleware/errorHandler";

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

const SCOPES = [
  "user.info.basic",     // open_id, avatar, display_name
  "user.info.profile",   // bio, username
  "user.info.stats",     // follower/following/likes/video counts
  "video.list",          // video metadata (caption, cover, duration)
  "video.insights",      // per-video views, likes, comments, shares (requires app review)
  "comment.list",        // video comments for NLP entity extraction (requires app review)
].join(",");

interface TikTokTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  open_id: string;
  scope?: string;
}

interface TikTokUser {
  username?: string;
  display_name?: string;
  avatar_url?: string;
  follower_count?: number;
  following_count?: number;
  video_count?: number;
  likes_count?: number;
}

function assertTikTokConfigured() {
  if (!env.tiktokClientKey || !env.tiktokClientSecret || !env.tiktokRedirectUri) {
    throw new AppError(503, "TikTok OAuth is not fully configured");
  }
}

export function getAuthorizationUrl(state: string): string {
  assertTikTokConfigured();

  const params = new URLSearchParams({
    client_key: env.tiktokClientKey,
    scope: SCOPES,
    response_type: "code",
    redirect_uri: env.tiktokRedirectUri,
    state,
  });

  return `${TIKTOK_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  assertTikTokConfigured();

  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: env.tiktokClientKey,
      client_secret: env.tiktokClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.tiktokRedirectUri,
    }),
  });

  if (!response.ok) {
    throw new AppError(502, "Failed to exchange TikTok authorization code");
  }

  const data = (await response.json()) as TikTokTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    openId: data.open_id,
    scope: data.scope,
  };
}

export async function fetchUserInfo(accessToken: string) {
  const response = await fetch(
    `${TIKTOK_USER_INFO_URL}?fields=open_id,union_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    throw new AppError(502, "Failed to fetch TikTok user info");
  }

  const payload = (await response.json()) as { data: { user: TikTokUser } };
  return payload.data.user;
}

export async function connectAccount(userId: string, code: string) {
  assertTikTokConfigured();

  const tokens = await exchangeCode(code);
  const userInfo = await fetchUserInfo(tokens.accessToken);

  const account = await prisma.connectedAccount.upsert({
    where: {
      userId_platform_platformUid: {
        userId,
        platform: "tiktok",
        platformUid: tokens.openId,
      },
    },
    update: {
      accessToken: encryptSecret(tokens.accessToken)!,
      refreshToken: encryptSecret(tokens.refreshToken) ?? undefined,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      scopes: tokens.scope ? tokens.scope.split(",") : [],
      username: userInfo.username,
      displayName: userInfo.display_name,
      avatarUrl: userInfo.avatar_url,
      isActive: true,
    },
    create: {
      userId,
      platform: "tiktok",
      platformUid: tokens.openId,
      accessToken: encryptSecret(tokens.accessToken)!,
      refreshToken: encryptSecret(tokens.refreshToken),
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      scopes: tokens.scope ? tokens.scope.split(",") : [],
      username: userInfo.username,
      displayName: userInfo.display_name,
      avatarUrl: userInfo.avatar_url,
    },
  });

  await prisma.accountSnapshot.create({
    data: {
      userId,
      accountId: account.id,
      followerCount: userInfo.follower_count,
      followingCount: userInfo.following_count,
      videoCount: userInfo.video_count,
      likeCount: userInfo.likes_count,
    },
  });

  return account;
}

export function readAccountTokens(account: { accessToken: string; refreshToken: string | null }) {
  return {
    accessToken: decryptSecret(account.accessToken),
    refreshToken: decryptSecret(account.refreshToken),
  };
}

export async function disconnectAccount(userId: string, accountId: string) {
  const account = await prisma.connectedAccount.findFirst({
    where: { id: accountId, userId },
  });

  if (!account) {
    throw new AppError(404, "Connected account not found");
  }

  await prisma.connectedAccount.update({
    where: { id: accountId },
    data: { isActive: false },
  });

  return { success: true };
}
