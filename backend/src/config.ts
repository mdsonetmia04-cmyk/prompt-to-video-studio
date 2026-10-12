import path from "node:path";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  port: num("PORT", 8787),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // AI
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiApiUrl: (process.env.AI_API_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
  aiModel: process.env.AI_MODEL ?? "gpt-4o-mini",
  aiMaxTokens: num("AI_MAX_TOKENS", 12000),
  aiTimeoutSeconds: num("AI_TIMEOUT_SECONDS", 90),

  // Rendering
  renderDir: path.resolve(process.env.RENDER_DIR ?? "./renders"),
  maxConcurrentJobs: Math.min(Math.max(Math.floor(num("MAX_CONCURRENT_JOBS", 2)), 1), 4),
  maxQueueLength: Math.floor(num("MAX_QUEUE_LENGTH", 10)),
  renderTimeoutMinutes: num("RENDER_TIMEOUT_MINUTES", 10),
  jobTtlMinutes: num("JOB_TTL_MINUTES", 60),
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH || "ffprobe",
  chromiumExecutablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,

  // Limits
  maxSourceBytes: 2 * 1024 * 1024,
  maxPromptChars: 4000,
  fps: 30,
};

export const RESOLUTIONS: Record<string, Record<string, [number, number]>> = {
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080] },
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080] },
};

export const VALID_DURATIONS = [10, 12] as const;
export type Duration = (typeof VALID_DURATIONS)[number];
export type AspectRatio = keyof typeof RESOLUTIONS;
