import { describe, it, expect } from "vitest";
import {
  validateRenderSettings,
  validateSource,
  validatePrompt,
  buildDownloadFilename,
  isValidJobId,
  newJobId,
  ValidationError,
} from "../../src/util/validation.js";

describe("validateRenderSettings", () => {
  const allResolutions: Array<[string, number, number]> = [
    ["16:9", 1280, 720],
    ["16:9", 1920, 1080],
    ["9:16", 720, 1280],
    ["9:16", 1080, 1920],
    ["1:1", 720, 720],
    ["1:1", 1080, 1080],
  ];

  it("accepts every whitelisted resolution for both durations", () => {
    for (const [aspectRatio, width, height] of allResolutions) {
      for (const duration of [10, 12]) {
        const s = validateRenderSettings({ duration, aspectRatio, width, height });
        expect(s.fps).toBe(30);
        expect(s.width).toBe(width);
        expect(s.height).toBe(height);
      }
    }
  });

  it("derives the quality label", () => {
    expect(validateRenderSettings({ duration: 10, aspectRatio: "16:9", width: 1280, height: 720 }).quality).toBe("720p");
    expect(validateRenderSettings({ duration: 12, aspectRatio: "1:1", width: 1080, height: 1080 }).quality).toBe("1080p");
  });

  it("accepts 5s draft duration", () => {
      expect(() => validateRenderSettings({ duration: 5, aspectRatio: "16:9", width: 1280, height: 720, quality: "720p" })).not.toThrow();
    });
    it("rejects invalid durations", () => {
    for (const duration of [0, 11, 15, "10", null]) {
      expect(() => validateRenderSettings({ duration, aspectRatio: "16:9", width: 1280, height: 720 })).toThrow(ValidationError);
    }
  });

  it("rejects resolutions not on the whitelist", () => {
    // Right dims, wrong aspect pairing:
    expect(() => validateRenderSettings({ duration: 10, aspectRatio: "9:16", width: 1920, height: 1080 })).toThrow(ValidationError);
    // Arbitrary dims:
    expect(() => validateRenderSettings({ duration: 10, aspectRatio: "16:9", width: 1366, height: 768 })).toThrow(ValidationError);
    expect(() => validateRenderSettings({ duration: 10, aspectRatio: "1:1", width: -720, height: 720 })).toThrow(ValidationError);
  });

  it("rejects non-30 fps", () => {
    expect(() => validateRenderSettings({ duration: 10, aspectRatio: "16:9", width: 1280, height: 720, fps: 60 })).toThrow(ValidationError);
  });

  it("rejects non-object bodies", () => {
    expect(() => validateRenderSettings(null)).toThrow(ValidationError);
    expect(() => validateRenderSettings("nope")).toThrow(ValidationError);
  });
});

describe("validateSource", () => {
  it("accepts normal HTML", () => {
    expect(validateSource("<!DOCTYPE html><html></html>")).toContain("<html>");
  });
  it("rejects empty / non-string source", () => {
    expect(() => validateSource("")).toThrow(ValidationError);
    expect(() => validateSource("   ")).toThrow(ValidationError);
    expect(() => validateSource(undefined)).toThrow(ValidationError);
  });
  it("rejects sources over 2 MB", () => {
    expect(() => validateSource("x".repeat(2 * 1024 * 1024 + 1))).toThrow(ValidationError);
  });
});

describe("validatePrompt", () => {
  it("accepts a normal prompt", () => {
    expect(validatePrompt("  make it green  ")).toBe("make it green");
  });
  it("rejects empty and over-long prompts", () => {
    expect(() => validatePrompt("")).toThrow(ValidationError);
    expect(() => validatePrompt("x".repeat(4001))).toThrow(ValidationError);
  });
});

describe("filenames and ids", () => {
  it("builds the documented download filename", () => {
    expect(buildDownloadFilename(12, 1920, 1080)).toBe("prompt-video-12s-1920x1080.mp4");
    expect(buildDownloadFilename(10, 720, 720)).toBe("prompt-video-10s-720x720.mp4");
  });
  it("sanitizes bad inputs instead of embedding them", () => {
    expect(buildDownloadFilename(99, -1, NaN)).toBe("prompt-video-0s-0x0.mp4");
  });
  it("generates and validates 32-hex job ids", () => {
    const id = newJobId();
    expect(isValidJobId(id)).toBe(true);
    expect(isValidJobId("../../etc/passwd")).toBe(false);
    expect(isValidJobId("")).toBe(false);
    expect(isValidJobId(id.toUpperCase())).toBe(false);
  });
});
