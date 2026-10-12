import { describe, it, expect, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../../src/config.js";
import { SAMPLE_SOURCE } from "../fixtures/sampleAnimation.js";
import { createJob, getJob, requestCancel } from "../../src/render/jobManager.js";
import { closeSharedBrowser } from "../../src/render/renderer.js";
import { validateRenderSettings } from "../../src/util/validation.js";

const createdDirs: string[] = [];

afterAll(async () => {
  await closeSharedBrowser();
  for (const dir of createdDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

function probe(file: string): Promise<{ streams?: any[]; format?: any }> {
  return new Promise((resolve, reject) => {
    execFile(
      config.ffprobePath,
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_frames,duration,pix_fmt",
        "-show_entries", "format=duration",
        "-of", "json",
        file,
      ],
      { timeout: 30000 },
      (err, stdout) => (err ? reject(err) : resolve(JSON.parse(stdout)))
    );
  });
}

async function waitForTerminal(id: string, timeoutMs: number) {
  const start = Date.now();
  for (;;) {
    const job = getJob(id);
    if (!job) throw new Error("job vanished");
    if (["done", "failed", "cancelled"].includes(job.status)) return job;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for job ${id} (status=${job.status})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

describe("render pipeline integration", () => {
  it(
    "renders the sample animation to a valid 10s 720x720 H.264 MP4",
    { timeout: 600000 },
    async () => {
      const settings = validateRenderSettings({
        duration: 10,
        aspectRatio: "1:1",
        width: 720,
        height: 720,
      });
      const job = await createJob(SAMPLE_SOURCE, settings);
      createdDirs.push(job.dir);
      expect(job.status).toBe("queued");

      const final = await waitForTerminal(job.id, 480000);
      expect(final.error).toBeNull();
      expect(final.status).toBe("done");

      const out = path.join(job.dir, "output.mp4");
      expect(existsSync(out)).toBe(true);

      const meta = await probe(out);
      const s = meta.streams![0];
      expect(s.codec_name).toBe("h264");
      expect(s.width).toBe(720);
      expect(s.height).toBe(720);
      expect(s.pix_fmt).toBe("yuv420p");
      expect(s.avg_frame_rate).toBe("30/1");
      expect(Number(meta.format.duration)).toBeCloseTo(10, 1);
      expect(Math.abs(Number(s.nb_frames) - 300)).toBeLessThanOrEqual(1);
    }
  );

  it(
    "cancelling a running job stops it and never reports success",
    { timeout: 600000 },
    async () => {
      const settings = validateRenderSettings({
        duration: 10,
        aspectRatio: "1:1",
        width: 720,
        height: 720,
      });
      const job = await createJob(SAMPLE_SOURCE, settings);
      createdDirs.push(job.dir);

      // Wait until it is actually rendering frames, then cancel.
      const start = Date.now();
      for (;;) {
        const j = getJob(job.id)!;
        if (j.status === "rendering" && j.framesDone > 5) break;
        if (["done", "failed", "cancelled"].includes(j.status)) throw new Error("job finished before we could cancel it");
        if (Date.now() - start > 240000) throw new Error("job never started rendering");
        await new Promise((r) => setTimeout(r, 1000));
      }

      requestCancel(job.id);
      const final = await waitForTerminal(job.id, 120000);
      expect(final.status).toBe("cancelled");
      // A cancelled job must never look successful.
      expect(final.status).not.toBe("done");
    }
  );
});
