import crypto from "crypto";
import { cacheDelete, cacheGet, cacheSet } from "./cache";

interface OAuthStatePending {
  userId: string;
  createdAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const STATE_TTL_SECONDS = STATE_TTL_MS / 1000;
const stateKey = (token: string) => `oauth-state:${token}`;

/**
 * Generate a cryptographically random state token tied to a userId.
 * The state is stored in-memory with a TTL — the callback must
 * validate it within 10 minutes.
 */
export async function createOAuthState(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const payload: OAuthStatePending = { userId, createdAt: Date.now() };
  await cacheSet(stateKey(token), JSON.stringify(payload), STATE_TTL_SECONDS);
  return token;
}

/**
 * Validate and consume a state token. Returns the userId if valid,
 * null if expired or unknown. Token is consumed on use (one-time).
 */
export async function consumeOAuthState(token: string): Promise<string | null> {
  const raw = await cacheGet(stateKey(token));
  if (!raw) return null;

  await cacheDelete(stateKey(token));
  const entry = JSON.parse(raw) as OAuthStatePending;
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;

  return entry.userId;
}
