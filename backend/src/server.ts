import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { config } from "./config.js";
import { generateRouter, aiSetupHint } from "./routes/generate.js";
import { renderRouter } from "./routes/render.js";
import { startSweeper, queueDepth } from "./render/jobManager.js";
import { isChromiumAvailable, closeSharedBrowser } from "./render/renderer.js";

const app = express();
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: "3mb" }));

// ── API ────────────────────────────────────────────────────────────────
app.use("/api", generateRouter);
app.use("/api/render", renderRouter);

app.get("/api/health", async (_req: Request, res: Response) => {
  const ffmpegVersion = await new Promise<string | null>((resolve) => {
    execFile(config.ffmpegPath, ["-version"], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(stdout.split("\n")[0]?.trim() ?? null);
    });
  });
  res.json({
    status: "ok",
    aiConfigured: config.aiApiKey.length > 0,
    aiModel: config.aiModel,
    ffmpeg: ffmpegVersion,
    chromium: isChromiumAvailable(),
    fps: config.fps,
    durations: [5, 10, 12],
    queue: queueDepth(),
    maxConcurrentJobs: config.maxConcurrentJobs,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// AI setup hint surfaced as JSON for clients that probe it.
app.get("/api/ai-status", (_req: Request, res: Response) => {
  res.json(aiSetupHint());
});

// ── Optional all-in-one mode: serve the built frontend from the backend ─────
// When frontend/dist exists (local PC setup), the full app is available at
// http://localhost:<port> with same-origin /api — no tunnel, no CORS, no Vercel
// env juggling needed. The Render Docker image has no frontend/dist, so this
// is skipped there automatically and the API behaves exactly as before.
const frontendDist = path.resolve(process.env.FRONTEND_DIST ?? "../frontend/dist");
const frontendIndex = path.join(frontendDist, "index.html");
if (existsSync(frontendIndex)) {
  app.use(express.static(frontendDist));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(frontendIndex);
  });
  // eslint-disable-next-line no-console
  console.log(`[studio] serving frontend from ${frontendDist}`);
}

// ── Error handling: technical details stay in server logs ──────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err as Error & { status?: number; code?: string };
  // eslint-disable-next-line no-console
  console.error(`[api] ${e.name ?? "Error"}: ${e.message}`);
  const status = typeof e.status === "number" ? e.status : 500;
  if (e.code === "AI_NOT_CONFIGURED") {
    return res.status(503).json(aiSetupHint());
  }
  // Mask only truly unknown server failures (500). Known error statuses
  // (400 validation, 401/429/502 provider errors, 503 not-configured) carry
  // actionable messages the user needs to see.
  const safeMessage =
    status === 500 ? "Internal server error. Check the backend logs for details." : e.message;
  res.status(status).json({ error: safeMessage, code: e.code });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found." });
});

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[studio] backend listening on :${config.port} (aiConfigured=${config.aiApiKey.length > 0})`);
});

startSweeper();

function shutdown() {
  server.close(() => process.exit(0));
  void closeSharedBrowser();
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default app;
