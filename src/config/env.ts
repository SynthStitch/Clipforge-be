import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required"),
  TIKTOK_CLIENT_KEY: z.string().default(""),
  TIKTOK_CLIENT_SECRET: z.string().default(""),
  TIKTOK_REDIRECT_URI: z.string().default(""),
  N8N_CREATOR_INTELLIGENCE_WEBHOOK: z.string().default(""),
  N8N_ASSET_GENERATION_WEBHOOK: z.string().default(""),
  N8N_WEBHOOK_SECRET: z.string().default(""),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment configuration\n${details.join("\n")}`);
}

export const env = {
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  databaseUrl: parsed.data.DATABASE_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
  encryptionKey: parsed.data.ENCRYPTION_KEY,
  tiktokClientKey: parsed.data.TIKTOK_CLIENT_KEY,
  tiktokClientSecret: parsed.data.TIKTOK_CLIENT_SECRET,
  tiktokRedirectUri: parsed.data.TIKTOK_REDIRECT_URI,
  n8nCreatorIntelligenceWebhook: parsed.data.N8N_CREATOR_INTELLIGENCE_WEBHOOK,
  n8nAssetGenerationWebhook: parsed.data.N8N_ASSET_GENERATION_WEBHOOK,
  n8nWebhookSecret: parsed.data.N8N_WEBHOOK_SECRET,
  frontendUrl: parsed.data.FRONTEND_URL,
} as const;
