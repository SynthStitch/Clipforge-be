import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const isProduction = process.env.NODE_ENV === "production";

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      console.error(`[Error] ${err.message}`, isProduction ? "" : err.stack);
    }
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Always log unexpected errors, but never include stack in production logs
  console.error(`[UnhandledError] ${err.message}`, isProduction ? "" : err.stack);

  res.status(500).json({ error: "Internal server error" });
}
