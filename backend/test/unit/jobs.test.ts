import { describe, it, expect } from "vitest";
import {
  setJobProgress,
  requestCancel,
  jobToPublic,
  type Job,
} from "../../src/render/jobManager.js";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "a".repeat(32),
    status: "queued",
    stage: "Queued",
    progress: null,
    error: null,
    settings: { duration: 10, aspectRatio: "16:9", width: 1280, height: 720, quality: "720p", fps: 30 },
    dir: "/tmp/test-job",
    framesTotal: 300,
    framesDone: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cancelRequested: false,
    outputPath: null,
    ...overrides,
  };
}

describe("job state machine", () => {
  it("rendering progress is a real percentage of frames done", () => {
    const job = makeJob();
    setJobProgress(job, "rendering", 150);
    expect(job.status).toBe("rendering");
    expect(job.stage).toBe("Rendering frames");
    expect(job.progress).toBe(50);
    expect(job.framesDone).toBe(150);
  });

  it("non-measurable stages report stage name with null progress", () => {
    const job = makeJob();
    for (const s of ["preparing", "encoding", "validating"] as const) {
      setJobProgress(job, s);
      expect(job.progress).toBeNull();
      expect(job.stage).not.toBe("Queued");
    }
    expect(job.stage).toBe("Validating output");
  });

  it("progress never claims 100% before done", () => {
    const job = makeJob();
    setJobProgress(job, "rendering", 300);
    expect(job.progress).toBeLessThanOrEqual(99);
  });

  it("requestCancel returns undefined for unknown job ids", () => {
    expect(requestCancel("c".repeat(32))).toBeUndefined();
    expect(requestCancel("not-an-id")).toBeUndefined();
  });

  it("public view hides internals and only exposes download when done", () => {
    const job = makeJob({ status: "rendering", progress: 42 });
    const pub = jobToPublic(job);
    expect(pub).not.toHaveProperty("dir");
    expect(pub).not.toHaveProperty("outputPath");
    expect(pub).not.toHaveProperty("cancelRequested");
    expect(pub.downloadUrl).toBeNull();

    const done = jobToPublic(makeJob({ status: "done", id: "b".repeat(32) }));
    expect(done.downloadUrl).toBe(`/api/render/${"b".repeat(32)}/download`);
  });
});
