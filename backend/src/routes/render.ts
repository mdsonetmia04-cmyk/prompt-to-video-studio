import { Router, type Request, type Response, type NextFunction } from "express";
import { createReadStream, existsSync } from "node:fs";
import {
  createJob,
  getJob,
  requestCancel,
  jobToPublic,
  queueDepth,
} from "../render/jobManager.js";
import {
  validateRenderSettings,
  validateSource,
  isValidJobId,
  buildDownloadFilename,
  ValidationError,
} from "../util/validation.js";

export const renderRouter = Router();

renderRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = validateRenderSettings(req.body);
    const source = validateSource(req.body?.source);
    const job = await createJob(source, settings);
    const depth = queueDepth();
    res.status(202).json({ ...jobToPublic(job), queue: depth });
  } catch (err) {
    const e = err as Error & { status?: number; retryAfter?: number };
    if (e.status === 429) {
      res.setHeader("Retry-After", String(e.retryAfter ?? 30));
    }
    next(err);
  }
});

renderRouter.get("/:jobId", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    if (!isValidJobId(jobId)) throw new ValidationError("Invalid job id.");
    const job = getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found or expired." });
    res.json(jobToPublic(job));
  } catch (err) {
    next(err);
  }
});

renderRouter.post("/:jobId/cancel", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    if (!isValidJobId(jobId)) throw new ValidationError("Invalid job id.");
    const job = requestCancel(jobId);
    if (!job) return res.status(404).json({ error: "Job not found or expired." });
    res.json(jobToPublic(job));
  } catch (err) {
    next(err);
  }
});

renderRouter.get("/:jobId/download", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    if (!isValidJobId(jobId)) throw new ValidationError("Invalid job id.");
    const job = getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found or expired." });
    if (job.status !== "done" || !job.outputPath || !existsSync(job.outputPath)) {
      return res.status(409).json({
        error: "Video is not ready for download.",
        status: job.status,
        stage: job.stage,
      });
    }
    const filename = buildDownloadFilename(
      job.settings.duration,
      job.settings.width,
      job.settings.height
    );
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // Never claim success before the file exists — stream the real file.
    const stream = createReadStream(job.outputPath);
    stream.on("error", (err) => next(err));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});
