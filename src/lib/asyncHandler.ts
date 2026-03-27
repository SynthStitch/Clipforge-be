import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async route handler so thrown errors are forwarded
 * to the Express error handler instead of crashing the process.
 *
 * Express 5 does propagate async rejections, but this makes it
 * explicit and works correctly in all environments.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
