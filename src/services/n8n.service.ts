import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";

function webhookHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // Include shared secret so n8n can verify the request came from this backend
  if (env.n8nWebhookSecret) {
    headers["X-Webhook-Secret"] = env.n8nWebhookSecret;
  }
  return headers;
}

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

/**
 * Trigger Workflow 1: ClipForge Intelligence Refresh
 * Kicks off: Load User → TikTok Tokens → Validate/Refresh →
 *   Fetch Profile → Save Snapshot → Fetch Videos → Loop →
 *   Upsert Videos + Metrics → Scrape Comments → NLP Entity Extraction →
 *   Compute Analytics → LLM Reasoning → Build Creative Brief →
 *   Save Brief + Recommendations → Log Ingestion Run
 */
export async function triggerCreatorIntelligence(userId: string, accountId: string) {
  if (!env.n8nCreatorIntelligenceWebhook) {
    throw new AppError(503, "ClipForge refresh webhook not configured");
  }

  const response = await fetch(env.n8nCreatorIntelligenceWebhook, {
    method: "POST",
    headers: webhookHeaders(),
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

/**
 * Trigger Workflow 2: ClipForge Asset Generation
 * Kicks off: Load Creative Brief → Load User Preferences →
 *   Content Planning (LLM) → Parse Content Plan →
 *   Route by Content Type:
 *     - Faceless Affiliate: Grok Imagine + ElevenLabs TTS → Package
 *     - Avatar Explainer: HeyGen → Poll Status → Package
 *     - Product Demo Hybrid: Higgsfield + ElevenLabs TTS → Package
 *   → Save Generated Assets → Log Generation Run
 */
export async function triggerAssetGeneration(
  userId: string,
  briefId: string,
  recommendationId?: string,
) {
  if (!env.n8nAssetGenerationWebhook) {
    throw new AppError(503, "ClipForge asset generation webhook not configured");
  }

  const response = await fetch(env.n8nAssetGenerationWebhook, {
    method: "POST",
    headers: webhookHeaders(),
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
