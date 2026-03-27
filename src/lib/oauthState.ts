import crypto from "crypto";

interface OAuthStatePending {
  userId: string;
  createdAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const pendingStates = new Map<string, OAuthStatePending>();

/**
 * Generate a cryptographically random state token tied to a userId.
 * The state is stored in-memory with a TTL — the callback must
 * validate it within 10 minutes.
 */
export function createOAuthState(userId: string): string {
  cleanup();
  const token = crypto.randomBytes(32).toString("hex");
  pendingStates.set(token, { userId, createdAt: Date.now() });
  return token;
}

/**
 * Validate and consume a state token. Returns the userId if valid,
 * null if expired or unknown. Token is consumed on use (one-time).
 */
export function consumeOAuthState(token: string): string | null {
  cleanup();
  const entry = pendingStates.get(token);
  if (!entry) return null;

  pendingStates.delete(token);

  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;

  return entry.userId;
}

/** Prune expired entries to prevent memory leaks */
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of pendingStates) {
    if (now - entry.createdAt > STATE_TTL_MS) {
      pendingStates.delete(key);
    }
  }
}
