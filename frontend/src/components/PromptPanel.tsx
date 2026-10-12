import { useState } from "react";
import { EXAMPLE_PROMPTS, type AspectRatio, type Duration, type Quality } from "../lib/api";

interface Props {
  prompt: string;
  setPrompt: (v: string) => void;
  duration: Duration;
  setDuration: (v: Duration) => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (v: AspectRatio) => void;
  quality: Quality;
  setQuality: (v: Quality) => void;
  generating: boolean;
  genError: string | null;
  aiConfigured: boolean | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  hasSource: boolean;
}

export default function PromptPanel(p: Props) {
  const [showExamples, setShowExamples] = useState(true);
  return (
    <>
      <div>
        <h2 className="section-title">Prompt</h2>
      </div>

      <div className="field">
        <textarea
          className="prompt"
          placeholder="Describe the animation you want…"
          value={p.prompt}
          onChange={(e) => p.setPrompt(e.target.value)}
        />
      </div>

      {p.aiConfigured === false && (
        <div className="notice warn">
          <strong>No AI key.</strong> Add your own free key
          (Groq, OpenRouter, Gemini…) in <b>AI Settings</b> ↑ to generate animations from prompts.
          You can also paste or upload HTML directly in the editor below.
        </div>
      )}

      {p.genError && <div className="error-text">{p.genError}</div>}

      <button className="btn primary block" disabled={p.generating || !p.prompt.trim()} onClick={p.onGenerate}>
        {p.generating && <span className="spinner" />}
        {p.generating ? "Generating…" : "Generate Animation"}
      </button>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn small block" disabled={p.generating || !p.hasSource} onClick={p.onRegenerate}>
          Regenerate
        </button>
      </div>

      <div>
        <button
          className="btn small block"
          style={{ borderStyle: "dashed" }}
          onClick={() => setShowExamples((s) => !s)}
        >
          {showExamples ? "Hide examples" : "Show example prompts"}
        </button>
        {showExamples && (
          <div className="examples" style={{ marginTop: 8 }}>
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <button key={i} className="example" onClick={() => p.setPrompt(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="section-title">Generation settings</h2>
      </div>

      <div className="field">
        <label>Duration</label>
        <div className="seg">
          {([10, 12] as Duration[]).map((d) => (
            <button key={d} className={p.duration === d ? "active" : ""} onClick={() => p.setDuration(d)}>
              {d} seconds
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Aspect ratio</label>
        <div className="seg">
          {(["16:9", "9:16", "1:1"] as AspectRatio[]).map((a) => (
            <button key={a} className={p.aspectRatio === a ? "active" : ""} onClick={() => p.setAspectRatio(a)}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Quality</label>
        <div className="seg">
          {(["720p", "1080p"] as Quality[]).map((q) => (
            <button key={q} className={p.quality === q ? "active" : ""} onClick={() => p.setQuality(q)}>
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="notice">
        Generation emits a single self-contained HTML document exposing{" "}
        <code style={{ fontFamily: "var(--mono)" }}>window.anim.init / renderFrame(t) / dispose</code>{" "}
        so the renderer can seek to any frame deterministically at 30 FPS.
      </div>
    </>
  );
}
