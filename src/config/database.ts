import { PrismaClient } from "@prisma/client";
import { env } from "./env";

function withEncryptionKey(url: string, encryptionKey: string) {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("options")) {
    parsed.searchParams.set("options", `-c app.encryption_key=${encryptionKey}`);
  }
  return parsed.toString();
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: withEncryptionKey(env.databaseUrl, env.encryptionKey),
      },
    },
    log: env.nodeEnv === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (env.nodeEnv !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
