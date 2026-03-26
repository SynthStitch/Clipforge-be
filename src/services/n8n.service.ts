import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";

async function parseWebhookResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return { ok: true };
  }

  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}

export async function triggerCreatorIntelligence(userId: string, accountId: string) {
  if (!env.n8nCreatorIntelligenceWebhook) {
    throw new AppError(503, "Creator Intelligence webhook not configured");
  }

  const response = await fetch(env.n8nCreatorIntelligenceWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      account_id: accountId,
      trigger: "manual_refresh",
    }),
  });

  if (!response.ok) {
    throw new AppError(502, `n8n workflow trigger failed: ${response.statusText}`);
  }

  return parseWebhookResponse(response);
}

export async function triggerAssetGeneration(
  userId: string,
  briefId: string,
  recommendationId?: string,
) {
  if (!env.n8nAssetGenerationWebhook) {
    throw new AppError(503, "Asset Generation webhook not configured");
  }

  const response = await fetch(env.n8nAssetGenerationWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      brief_id: briefId,
      recommendation_id: recommendationId || null,
      trigger: "manual",
    }),
  });

  if (!response.ok) {
    throw new AppError(502, `n8n workflow trigger failed: ${response.statusText}`);
  }

  return parseWebhookResponse(response);
}
