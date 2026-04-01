import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export function internalAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-internal-key"];
  const value = Array.isArray(key) ? key[0] : key;

  if (!value || !timingSafeEqual(value, env.internalApiKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

/** Constant-time string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
