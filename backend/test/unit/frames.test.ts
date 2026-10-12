import { describe, it, expect } from "vitest";
import { frameCountFor, frameTimesFor } from "../../src/util/validation.js";
import { config } from "../../src/config.js";

describe("frame schedule", () => {
  it("10s renders exactly 300 frames at 30 FPS", () => {
    expect(config.fps).toBe(30);
    expect(frameCountFor(10)).toBe(300);
  });

  it("12s renders exactly 360 frames at 30 FPS", () => {
    expect(frameCountFor(12)).toBe(360);
  });

  it("frame timestamps are i/30 for i in 0..N-1", () => {
    for (const duration of [10, 12]) {
      const times = frameTimesFor(duration);
      const n = duration * 30;
      expect(times).toHaveLength(n);
      expect(times[0]).toBe(0);
      expect(times[n - 1]).toBeCloseTo((n - 1) / 30, 10);
      for (let i = 1; i < n; i++) {
        expect(times[i] - times[i - 1]).toBeCloseTo(1 / 30, 10);
      }
    }
  });

  it("schedule is deterministic across calls", () => {
    expect(frameTimesFor(10)).toEqual(frameTimesFor(10));
  });
});
