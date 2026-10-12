import { rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { newJobId, type ValidatedRenderSettings } from "../util/validation.js";
import { runRenderJob, RenderCancelledError } from "./renderer.js";

export type JobStatus =
  | "queued"
  | "preparing"
  | "rendering"
  | "encoding"
  | "validating"
  | "done"
  | "failed"
  | "cancelled";

export type JobStage =
  | "Queued"
  | "Preparing animation"
  | "Initializing browser"
  | "Rendering frames"
  | "Recording live animation"
  | "Encoding MP4"
  | "Validating output"
  | "Ready to download";

export interface Job {
  id: string;
  status: JobStatus;
  stage: JobStage;
  /** 0-100 when measurable, otherwise null (stage name is shown instead). */
  progress: number | null;
  error: string | null;
  settings: ValidatedRenderSettings;
  dir: string;
  framesTotal: number;
  framesDone: number;
  createdAt: number;
  updatedAt: number;
  cancelRequested: boolean;
  /** Set by the watchdog when the per-job time budget is exceeded. */
  timedOut?: boolean;
  outputPath: string | null;
}

const jobs = new Map<string, Job>();
const queue: string[] = [];
let activeCount = 0;

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function queueDepth(): { active: number; queued: number } {
  return { active: activeCount, queued: queue.length };
}

const STAGE_FOR_STATUS: Record<JobStatus, JobStage> = {
  queued: "Queued",
  preparing: "Preparing animation",
  rendering: "Rendering frames",
  encoding: "Encoding MP4",
  validating: "Validating output",
  done: "Ready to download",
  failed: "Rendering frames",
  cancelled: "Queued",
};

export async function createJob(source: string, settings: ValidatedRenderSettings): Promise<Job> {
  if (queue.length >= config.maxQueueLength) {
    const err = new Error(
      `Render queue is full (${config.maxQueueLength} waiting). Try again shortly.`
    ) as Error & { status?: number; retryAfter?: number };
    err.status = 429;
    err.retryAfter = 30;
    throw err;
  }
  const id = newJobId();
  const dir = path.join(config.renderDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "source.html"), source, "utf8");

  const framesTotal = settings.duration * settings.fps;
  const job: Job = {
    id,
    status: "queued",
    stage: "Queued",
    progress: null,
    error: null,
    settings,
    dir,
    framesTotal,
    framesDone: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cancelRequested: false,
    outputPath: null,
  };
  jobs.set(id, job);
  queue.push(id);
  await persistJob(job);
  // Defer to the next tick so the caller observes the initial "queued" state.
  setImmediate(() => void pump());
  return job;
}

export function requestCancel(id: string): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (job.status === "done" || job.status === "failed" || job.status === "cancelled") return job;
  job.cancelRequested = true;
  job.updatedAt = Date.now();
  if (job.status === "queued") {
    const idx = queue.indexOf(id);
    if (idx >= 0) queue.splice(idx, 1);
    job.status = "cancelled";
    job.stage = "Queued";
    job.error = "Cancelled while queued.";
    void persistJob(job);
  }
  return job;
}

async function pump(): Promise<void> {
  while (activeCount < config.maxConcurrentJobs && queue.length > 0) {
    const id = queue.shift()!;
    const job = jobs.get(id);
    if (!job || job.cancelRequested) continue;
    activeCount++;
    void execute(job).finally(() => {
      activeCount--;
      void pump();
    });
  }
}

async function execute(job: Job): Promise<void> {
  const timeoutMs = config.renderTimeoutMinutes * 60 * 1000;
  const watchdog = setTimeout(() => {
    job.cancelRequested = true;
    job.timedOut = true;
    if (job.status !== "done" && job.status !== "failed" && job.status !== "cancelled") {
      job.error = `Rendering timed out after ${config.renderTimeoutMinutes} minutes.`;
    }
  }, timeoutMs);
  // Don't let the watchdog keep the process alive on its own.
  watchdog.unref?.();

  try {
    await runRenderJob(job);
  } catch (err) {
    if (job.status !== "done" && job.status !== "cancelled") {
      if (job.timedOut) {
        // Watchdog already wrote the timeout message.
        job.status = "failed";
      } else if (err instanceof RenderCancelledError || job.cancelRequested) {
        job.status = "cancelled";
        job.stage = "Queued";
        job.progress = null;
        if (!job.error) job.error = "Cancelled.";
      } else {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : String(err);
      }
    }
  } finally {
    clearTimeout(watchdog);
    job.updatedAt = Date.now();
    await persistJob(job).catch(() => {});
  }
}

export function setJobProgress(job: Job, status: JobStatus, framesDone?: number): void {
  job.status = status;
  job.stage = STAGE_FOR_STATUS[status];
  if (typeof framesDone === "number") job.framesDone = framesDone;
  if (status === "rendering" && job.framesTotal > 0) {
    job.progress = Math.min(99, Math.round((job.framesDone / job.framesTotal) * 100));
  } else {
    job.progress = null;
  }
  job.updatedAt = Date.now();
}

async function persistJob(job: Job): Promise<void> {
  const snapshot = {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    error: job.error,
    settings: job.settings,
    framesTotal: job.framesTotal,
    framesDone: job.framesDone,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
  await writeFile(path.join(job.dir, "status.json"), JSON.stringify(snapshot, null, 2), "utf8").catch(
    () => {}
  );
}

export function persistJobNow(job: Job): Promise<void> {
  return persistJob(job);
}

export function jobToPublic(job: Job) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    error: job.error,
    settings: job.settings,
    framesTotal: job.framesTotal,
    framesDone: job.framesDone,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    downloadUrl: job.status === "done" ? `/api/render/${job.id}/download` : null,
  };
}

/** Delete jobs (and files) older than the TTL. Runs on an interval. */
export async function sweepExpiredJobs(): Promise<number> {
  const cutoff = Date.now() - config.jobTtlMinutes * 60 * 1000;
  let removed = 0;
  for (const [id, job] of jobs) {
    const terminal = job.status === "done" || job.status === "failed" || job.status === "cancelled";
    if (terminal && job.updatedAt < cutoff) {
      jobs.delete(id);
      await rm(job.dir, { recursive: true, force: true }).catch(() => {});
      removed++;
    }
  }
  // Also clean orphaned directories with no live job record.
  if (existsSync(config.renderDir)) {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(config.renderDir).catch(() => [] as string[]);
    for (const entry of entries) {
      if (!jobs.has(entry) && /^[0-9a-f]{32}$/.test(entry)) {
        const full = path.join(config.renderDir, entry);
        const { stat } = await import("node:fs/promises");
        const st = await stat(full).catch(() => null);
        if (st && st.mtimeMs < cutoff) {
          await rm(full, { recursive: true, force: true }).catch(() => {});
          removed++;
        }
      }
    }
  }
  return removed;
}

export function startSweeper(): void {
  const interval = setInterval(() => {
    void sweepExpiredJobs().catch(() => {});
  }, 5 * 60 * 1000);
  interval.unref?.();
}
