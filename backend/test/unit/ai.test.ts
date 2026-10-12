import { describe, it, expect } from "vitest";
import { extractHtml, generateAnimation, AiNotConfiguredError } from "../../src/ai/provider.js";
import { SAMPLE_SOURCE, SAMPLE_META } from "../fixtures/sampleAnimation.js";

describe("AI provider adapter", () => {
  it("strips markdown fences to raw HTML", () => {
    expect(extractHtml("```html\n<b>hi</b>\n```")).toBe("<b>hi</b>");
    expect(extractHtml("```\n<b>hi</b>\n```")).toBe("<b>hi</b>");
    expect(extractHtml("<b>hi</b>")).toBe("<b>hi</b>");
  });

  it("returns a clear 503 when no AI key is configured", async () => {
    await expect(generateAnimation("make something", 10, "16:9")).rejects.toBeInstanceOf(
      AiNotConfiguredError
    );
    try {
      await generateAnimation("make something", 10, "16:9");
    } catch (err) {
      const e = err as AiNotConfiguredError;
      expect(e.status).toBe(503);
      expect(e.code).toBe("AI_NOT_CONFIGURED");
      expect(e.message).toContain("AI_API_KEY");
    }
  });

  it("rejects empty prompts before touching the provider", async () => {
    await expect(generateAnimation("", 10, "16:9")).rejects.toThrow(/non-empty/);
  });
});

describe("sample animation fixture", () => {
  it("is a self-contained document exposing the deterministic interface", () => {
    expect(SAMPLE_SOURCE).toContain("<!DOCTYPE html>");
    expect(SAMPLE_SOURCE).toContain("window.anim");
    expect(SAMPLE_SOURCE).toContain("renderFrame");
    expect(SAMPLE_SOURCE).toContain("init");
    expect(SAMPLE_SOURCE).toContain("dispose");
    // No external resources allowed:
    expect(SAMPLE_SOURCE).not.toMatch(/src="http|<link[^>]+href="http|@import|fetch\(/);
    expect(SAMPLE_META.duration).toBe(12);
  });
});
