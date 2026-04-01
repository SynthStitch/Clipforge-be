import crypto from "crypto";
import { env } from "../config/env";

const PREFIX = "enc:v1";

function getKey() {
  return crypto.createHash("sha256").update(env.encryptionKey).digest();
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) {
    return value ?? null;
  }

  if (value.startsWith(`${PREFIX}:`)) {
    return value;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) {
    return value ?? null;
  }

  if (!value.startsWith(`${PREFIX}:`)) {
    return value;
  }

  const [, ivHex, tagHex, payloadHex] = value.split(":");
  if (!ivHex || !tagHex || !payloadHex) {
    throw new Error("Encrypted secret has invalid format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
