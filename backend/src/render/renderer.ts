import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { config } from "../config.js";
import { frameCountFor } from "../util/validation.js";
import { setJobProgress, persistJobNow, type Job, type JobStage } from "./jobManager.js";

export class RenderCancelledError extends Error {
  constructor(message = "Render job was cancelled.") {
    super(message);
    this.name = "RenderCancelledError";
  }
}

let sharedBrowser: Browser | null = null;
let browserStarting: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser?.isConnected()) return sharedBrowser;
  if (!browserStarting) {
    browserStarting = (async () => {
      const args = ["--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"];
      // Containers often run as root; Chromium refuses to start without --no-sandbox then.
      if (typeof process.getuid === "function" && process.getuid() === 0) args.push("--no-sandbox");
      const browser = await chromium.launch({
        headless: true,
        args,
        executablePath: config.chromiumExecutablePath,
      });
      sharedBrowser = browser;
      browser.on("disconnected", () => {
        sharedBrowser = null;
      });
      return browser;
    })().finally(() => {
      browserStarting = null;
    });
  }
  return browserStarting;
}

export function isChromiumAvailable(): boolean {
  return !!config.chromiumExecutablePath || existsSync(chromium.executablePath());
}

function checkCancelled(job: Job): void {
  if (job.cancelRequested) throw new RenderCancelledError();
}

/**
 * Render pipeline (two capture modes):
 *  1. load source in an isolated Chromium context (all network blocked)
 *  2. "seek" mode (window.anim.renderFrame exists): init() at t=0, then screenshot
 *     renderFrame(i/30) for every frame — deterministic and frame-perfect.
 *     "live" mode (any other HTML): let the page run on wall-clock time and capture
 *     frames paced across the duration — a genuine recording, timing approximate.
 *  3. encode PNG sequence to H.264 MP4 with FFmpeg
 *  4. validate with FFprobe (codec, dims, fps, duration, frame count)
 */
export async function runRenderJob(job: Job): Promise<void> {
  const { width, height, duration, fps } = job.settings;
  const totalFrames = frameCountFor(duration);
  const framesDir = path.join(job.dir, "frames");
  const outPath = path.join(job.dir, "output.mp4");

  setJobProgress(job, "preparing");
  await persistJobNow(job);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(framesDir, { recursive: true });

  const source = await readFile(path.join(job.dir, "source.html"), "utf8");
  checkCancelled(job);

  // ── Browser: capture every frame at the fixed 30 FPS schedule ──
  setJobProgress(job, "rendering", 0);
  job.stage = "Initializing browser";
  await persistJobNow(job);

  const browser = await getBrowser().catch((err) => {
    throw new Error(`Browser launch failed: ${(err as Error).message}`);
  });

  // Isolated context per job: exact viewport, no shared state.
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    javaScriptEnabled: true,
  });
  try {
    // Offline rendering: block ALL network (incl. cloud metadata / internal IPs).
    await context.route(/.*/, (route) => {
      const url = route.request().url();
      if (url.startsWith("http://") || url.startsWith("https://")) return route.abort();
      return route.continue();
    });

    const page = await context.newPage();
    try {
      await page.setContent(source, { waitUntil: "load", timeout: 30000 }).catch((err) => {
        throw new Error(`Animation page failed to load: ${(err as Error).message}`);
      });

      // Two capture modes:
      //  - "seek" (deterministic): source exposes window.anim.renderFrame(t) — every
      //    frame is drawn at its exact timestamp. Frame-perfect and reproducible.
      //  - "live" (wall-clock): any other HTML (rAF loops, CSS keyframes, SMIL…).
      //    The page runs on its own clock while we capture frames paced across the
      //    duration — a genuine recording of the animation, but timing is approximate.
      const mode = await page.evaluate(() => {
        const w = window as unknown as { anim?: { renderFrame?: unknown } };
        return typeof w.anim?.renderFrame === "function" ? ("seek" as const) : ("live" as const);
      });
      job.stage = mode === "seek" ? "Rendering frames" : "Recording live animation";

      await page
        .evaluate(() => {
          const w = window as unknown as {
            anim: { init?: () => void; renderFrame?: (t: number) => void };
          };
          w.anim?.init?.();
        })
        .catch((err) => {
          throw new Error(`Animation init() failed: ${(err as Error).message}`);
        });

      // Let first paint settle (fonts/layout), then capture.
      await page.waitForTimeout(400);
      checkCancelled(job);

      const captureFrame = async (i: number) => {
        const framePath = path.join(framesDir, `frame${String(i).padStart(4, "0")}.jpg`);
        // JPEG (not PNG): Chromium captures it ~2-3x faster and FFmpeg decodes it
        // faster. Quality 85 is visually transparent once re-encoded to H.264.
        await page
          .screenshot({ path: framePath, type: "jpeg", quality: 85, timeout: 30000 })
          .catch((err) => {
            throw new Error(`Frame capture failed at frame ${i}: ${(err as Error).message}`);
          });
      };
      const reportFrame = async (i: number, stage: JobStage) => {
        if (i % 10 === 0 || i === totalFrames - 1) {
          setJobProgress(job, "rendering", i + 1);
          job.stage = stage; // setJobProgress maps status->stage; keep our mode label
          await persistJobNow(job);
        } else {
          job.framesDone = i + 1;
        }
      };

      if (mode === "seek") {
        for (let i = 0; i < totalFrames; i++) {
          checkCancelled(job);
          const t = i / fps;
          await page
            .evaluate((tt: number) => {
              const w = window as unknown as { anim: { renderFrame: (t: number) => void } };
              w.anim.renderFrame(tt);
            }, t)
            .catch((err) => {
              throw new Error(`renderFrame(${(i / fps).toFixed(3)}) failed: ${(err as Error).message}`);
            });
          await captureFrame(i);
          await reportFrame(i, "Rendering frames");
        }
      } else {
        // Live-record: pace captures evenly across the duration on wall-clock time.
        // If a screenshot is slow we catch up instead of drifting (never skip waiting
        // ahead — a late frame just shifts the remaining schedule).
        const startMs = Date.now();
        for (let i = 0; i < totalFrames; i++) {
          checkCancelled(job);
          const targetMs = (i / totalFrames) * duration * 1000;
          const elapsedMs = Date.now() - startMs;
          if (targetMs > elapsedMs) await page.waitForTimeout(targetMs - elapsedMs);
          await captureFrame(i);
          await reportFrame(i, "Recording live animation");
        }
      }

      await page
        .evaluate(() => {
          const w = window as unknown as { anim: { dispose?: () => void } };
          w.anim.dispose?.();
        })
        .catch(() => {});
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await context.close().catch(() => {});
  }
  checkCancelled(job);

  // ── FFmpeg: constant-frame-rate H.264 MP4 ──
  setJobProgress(job, "encoding");
  await persistJobNow(job);
  await encodeFrames(job, framesDir, outPath, totalFrames);
  checkCancelled(job);

  // ── FFprobe validation ──
  setJobProgress(job, "validating");
  await persistJobNow(job);
  await validateOutput(job, outPath, totalFrames);

  job.outputPath = outPath;
  job.status = "done";
  job.stage = "Ready to download";
  job.progress = 100;
  job.updatedAt = Date.now();
  await persistJobNow(job);
}

function encodeFrames(job: Job, framesDir: string, outPath: string, totalFrames: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const pattern = path.join(framesDir, "frame%04d.jpg");
    const args = [
      "-y",
      "-framerate", "30",
      "-i", pattern,
      "-frames:v", String(totalFrames),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-movflags", "+faststart",
      outPath,
    ];
    const child = spawn(config.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    const onCancel = () => {
      child.kill("SIGKILL");
    };
    const cancelTimer = setInterval(() => {
      if (job.cancelRequested) onCancel();
    }, 200);
    child.on("error", (err) => {
      clearInterval(cancelTimer);
      reject(new Error(`FFmpeg failed to start (${config.ffmpegPath}): ${(err as Error).message}`));
    });
    child.on("close", (code, signal) => {
      clearInterval(cancelTimer);
      if (job.cancelRequested) return reject(new RenderCancelledError());
      if (code === 0 && existsSync(outPath)) return resolve();
      reject(
        new Error(
          `FFmpeg encoding failed (exit ${code ?? signal}). ${stderr.slice(-500).trim()}`
        )
      );
    });
  });
}

interface ProbeStream {
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  nb_frames?: string;
  duration?: string;
}

async function validateOutput(job: Job, outPath: string, totalFrames: number): Promise<void> {
  const { width, height, duration } = job.settings;
  const probe = await new Promise<{ streams?: ProbeStream[]; format?: { duration?: string } }>(
    (resolve, reject) => {
      const args = [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_frames,duration",
        "-show_entries", "format=duration",
        "-of", "json",
        outPath,
      ];
      const child = spawn(config.ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("error", (e) => reject(new Error(`FFprobe failed to start: ${(e as Error).message}`)));
      child.on("close", (code) => {
        if (code !== 0) return reject(new Error(`FFprobe failed: ${err.slice(0, 300)}`));
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error("FFprobe returned unparseable output."));
        }
      });
    }
  );

  const stream = probe.streams?.[0];
  if (!stream) throw new Error("Validation failed: no video stream found in output.");
  const problems: string[] = [];

  if (stream.codec_name !== "h264") problems.push(`codec is ${stream.codec_name ?? "unknown"}, expected h264`);
  if (stream.width !== width || stream.height !== height)
    problems.push(`dimensions are ${stream.width}x${stream.height}, expected ${width}x${height}`);

  const fps = parseFrameRate(stream.avg_frame_rate);
  if (fps === null || Math.abs(fps - 30) > 0.01)
    problems.push(`frame rate is ${stream.avg_frame_rate ?? "unknown"}, expected 30`);

  const dur = Number(probe.format?.duration ?? stream.duration);
  if (!Number.isFinite(dur) || Math.abs(dur - duration) > 0.15)
    problems.push(`duration is ${Number.isFinite(dur) ? dur.toFixed(3) : "unknown"}s, expected ${duration}s (±0.15s)`);

  const nb = Number(stream.nb_frames);
  if (Number.isFinite(nb) && Math.abs(nb - totalFrames) > 1)
    problems.push(`frame count is ${nb}, expected ${totalFrames}`);

  if (problems.length > 0) {
    throw new Error(`Output validation failed: ${problems.join("; ")}.`);
  }
}

function parseFrameRate(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d+)\/(\d+)$/);
  if (!m) {
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }
  const den = Number(m[2]);
  return den === 0 ? null : Number(m[1]) / den;
}

/** Graceful shutdown helper: close the shared browser. */
export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
  }
}
