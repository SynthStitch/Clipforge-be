import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";

// Route imports
import authRoutes from "./routes/auth.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import videosRoutes from "./routes/videos.routes";
import insightsRoutes from "./routes/insights.routes";
import recommendationsRoutes from "./routes/recommendations.routes";
import assetsRoutes from "./routes/assets.routes";
import accountRoutes from "./routes/account.routes";
import oauthRoutes from "./routes/oauth.routes";
import webhooksRoutes from "./routes/webhooks.routes";

const app = express();

// --- Middleware ---
app.use(helmet());
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
app.use(express.json());
app.use("/api", apiLimiter);

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/videos", videosRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/recommendations", recommendationsRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/oauth", oauthRoutes);
app.use("/api/sync", webhooksRoutes);

// --- Health check ---
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Error handler (must be last) ---
app.use(errorHandler);

// --- Start ---
app.listen(env.port, () => {
  console.log(`ClipForge API running on port ${env.port} [${env.nodeEnv}]`);
});

export default app;
