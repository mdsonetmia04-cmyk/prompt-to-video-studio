import { useCallback, useEffect, useState } from "react";
import PromptPanel from "./components/PromptPanel";
import PreviewPanel from "./components/PreviewPanel";
import RenderPanel from "./components/RenderPanel";
import EditorPanel from "./components/EditorPanel";
import AiSettingsModal from "./components/AiSettingsModal";
import { api, type AspectRatio, type Duration, type Quality } from "./lib/api";
import { loadAiSettings, type AiBrowserSettings } from "./lib/aiKeys";
import "./index.css";

interface Health {
  ffmpeg: string | null;
  chromium: boolean;
  aiConfigured: boolean;
  fps: number;
  queue: { active: number; queued: number };
}

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<Duration>(12);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [quality, setQuality] = useState<Quality>("720p");

  const [source, setSource] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [browserKey, setBrowserKey] = useState<AiBrowserSettings | null>(() => loadAiSettings());
  const [aiModalOpen, setAiModalOpen] = useState(false);

  useEffect(() => {
    api.aiStatus().then((s) => setAiConfigured(s.aiConfigured)).catch(() => setAiConfigured(false));
    api.health().then((h) => setHealth(h as unknown as Health)).catch(() => {});
  }, []);

  const applySource = useCallback((s: string) => {
    setSource(s);
    setLastGenerated(s);
  }, []);

  const doGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setGenError("Enter a prompt first, or use the demo animation.");
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const r = await api.generate(prompt, duration, aspectRatio, browserKey);
      applySource(r.source);
    } catch (err) {
      const e = err as Error & { status?: number; body?: { message?: string } };
      if (e.status === 503) {
        setGenError(
          (e.body?.message as string) ||
            "AI generation is not configured. Add a free provider key in AI Settings, or use the demo animation."
        );
      } else {
        setGenError(`Generation failed: ${e.message}`);
      }
    } finally {
      setGenerating(false);
    }
  }, [prompt, duration, aspectRatio, browserKey, applySource]);

  const useDemo = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const r = await api.demo();
      applySource(r.source);
    } catch (err) {
      setGenError(`Could not load demo: ${(err as Error).message}`);
    } finally {
      setGenerating(false);
    }
  }, [applySource]);

  const canRender = source !== "" && /renderFrame|window\s*\.\s*anim/.test(source);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▶</span>
          Prompt to Video Studio
        </div>
        <div className="spacer" />
        <button
          className="ai-status"
          onClick={() => setAiModalOpen(true)}
          title="AI Settings — use your own free provider key"
        >
          <span className={`dot ${browserKey || aiConfigured ? "" : "off"}`} />
          {browserKey ? "AI: browser key" : aiConfigured ? "AI: server key" : "AI: setup"}
        </button>
        <span className="health-dot" title={health?.ffmpeg ?? "FFmpeg status unknown"}>
          <span className={`dot ${health?.ffmpeg ? "" : "off"}`} />
          {health?.ffmpeg ? "Renderer ready" : "Checking renderer…"}
        </span>
      </header>
      <AiSettingsModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onSaved={setBrowserKey}
      />

      <main className="workspace">
        <section className="col left">
          <PromptPanel
            prompt={prompt}
            setPrompt={setPrompt}
            duration={duration}
            setDuration={setDuration}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            quality={quality}
            setQuality={setQuality}
            generating={generating}
            genError={genError}
            aiConfigured={aiConfigured || !!browserKey}
            onGenerate={doGenerate}
            onRegenerate={doGenerate}
            onUseDemo={useDemo}
            hasSource={source !== ""}
          />
        </section>

        <section className="col center">
          <PreviewPanel source={source} duration={duration} aspectRatio={aspectRatio} />
          <RenderPanel
            source={source}
            duration={duration}
            aspectRatio={aspectRatio}
            quality={quality}
            canRender={canRender}
          />
        </section>

        <section className="col right">
          <EditorPanel source={source} lastGenerated={lastGenerated} onApply={setSource} />
        </section>
      </main>

      <footer className="foot">
        Prompt → HTML/CSS/JS → sandboxed preview → deterministic Chromium frame capture @ 30 FPS →
        FFmpeg H.264 MP4 → FFprobe validation.{" "}
        {health && (
          <>
            <code>{health.ffmpeg ? health.ffmpeg.split(" ").slice(0, 3).join(" ") : "ffmpeg: missing"}</code>
            {" · "}chromium: {health.chromium ? "ok" : "missing"}
            {" · "}AI: {browserKey ? "browser key" : health.aiConfigured ? "server key" : "demo mode"}
          </>
        )}
      </footer>
    </div>
  );
}
