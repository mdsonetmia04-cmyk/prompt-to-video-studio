import { randomBytes } from "node:crypto";
import { config, RESOLUTIONS, VALID_DURATIONS } from "../config.js";

export function newJobId(): string {
  return randomBytes(16).toString("hex");
}

export function isValidJobId(id: string): boolean {
  return /^[0-9a-f]{32}$/.test(id);
}

/** Frames for a duration at the configured FPS. 10s → 300, 12s → 360. */
export function frameCountFor(duration: number): number {
  return Math.round(duration * config.fps);
}

/** Exact per-frame timestamps, i/30 for i in 0..N-1. */
export function frameTimesFor(duration: number): number[] {
  const n = frameCountFor(duration);
  return Array.from({ length: n }, (_, i) => i / config.fps);
}

export interface ValidatedRenderSettings {
  duration: (typeof VALID_DURATIONS)[number];
  aspectRatio: "16:9" | "9:16" | "1:1";
  width: number;
  height: number;
  quality: "720p" | "1080p";
  fps: 30;
}

export function validateRenderSettings(body: unknown): ValidatedRenderSettings {
  if (typeof body !== "object" || body === null) throw new ValidationError("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  const duration = b.duration;
  if (duration !== 5 && duration !== 10 && duration !== 12) {
    throw new ValidationError(`duration must be 5, 10 or 12 (seconds), got ${JSON.stringify(duration)}.`);
  }
  const aspectRatio = b.aspectRatio;
  if (aspectRatio !== "16:9" && aspectRatio !== "9:16" && aspectRatio !== "1:1") {
    throw new ValidationError(`aspectRatio must be one of 16:9, 9:16, 1:1, got ${JSON.stringify(aspectRatio)}.`);
  }
  const width = b.width;
  const height = b.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) <= 0 || (height as number) <= 0) {
    throw new ValidationError("width and height must be positive integers.");
  }
  const table = RESOLUTIONS[aspectRatio];
  const entry = Object.entries(table).find(([, [w, h]]) => w === width && h === height);
  if (!entry) {
    const allowed = Object.entries(table)
      .map(([q, [w, h]]) => `${q}: ${w}x${h}`)
      .join(", ");
    throw new ValidationError(
      `Resolution ${width}x${height} is not allowed for ${aspectRatio}. Allowed: ${allowed}.`
    );
  }
  const fps = b.fps;
  if (fps !== undefined && fps !== 30) throw new ValidationError("fps must be 30.");
  return { duration, aspectRatio, width: width as number, height: height as number, quality: entry[0] as "720p" | "1080p", fps: 30 };
}

export function validateSource(source: unknown): string {
  if (typeof source !== "string" || source.trim().length === 0) {
    throw new ValidationError("source must be a non-empty HTML string.");
  }
  const bytes = Buffer.byteLength(source, "utf8");
  if (bytes > config.maxSourceBytes) {
    throw new ValidationError(`source is too large (${(bytes / 1024 / 1024).toFixed(2)} MB > 2 MB limit).`);
  }
  return source;
}

export function validatePrompt(prompt: unknown): string {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new ValidationError("prompt must be a non-empty string.");
  }
  const trimmed = prompt.trim();
  if (trimmed.length > config.maxPromptChars) {
    throw new ValidationError(`prompt is too long (${trimmed.length} > ${config.maxPromptChars} chars).`);
  }
  return trimmed;
}

export function isAllowedDuration(d: unknown): d is 10 | 12 {
  return (VALID_DURATIONS as readonly unknown[]).includes(d);
}

export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Safe filename for the downloadable MP4: prompt-video-<10s|12s>-<WxH>.mp4 */
export function buildDownloadFilename(duration: number, width: number, height: number): string {
  const d = duration === 5 || duration === 10 || duration === 12 ? duration : 0;
  const w = Number.isInteger(width) && width > 0 ? width : 0;
  const h = Number.isInteger(height) && height > 0 ? height : 0;
  return `prompt-video-${d}s-${w}x${h}.mp4`;
}
