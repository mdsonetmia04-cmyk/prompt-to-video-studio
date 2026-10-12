import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildPreviewDoc, formatTime, type AspectRatio } from "../lib/api";

interface Props {
  source: string;
  duration: number;
  aspectRatio: AspectRatio;
}

const ASPECT_CSS: Record<AspectRatio, string> = {
  "16:9": "16 / 9",
  "9:16": "9 / 16",
  "1:1": "1 / 1",
};

export default function PreviewPanel({ source, duration, aspectRatio }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [ready, setReady] = useState(false);
  const [hasAnim, setHasAnim] = useState<boolean | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const readyRef = useRef(false);

  const doc = useMemo(() => (source ? buildPreviewDoc(source) : ""), [source]);

  const seek = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(duration, time));
    tRef.current = clamped;
    setT(clamped);
    iframeRef.current?.contentWindow?.postMessage({ ns: "ptvs", type: "ptvs-seek", t: clamped }, "*");
  }, [duration]);

  // Controlled clock: advance t on rAF, drive renderFrame(t) via postMessage.
  useEffect(() => {
    playingRef.current = playing;
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    lastTsRef.current = performance.now();
    const loop = (now: number) => {
      const dt = (now - lastTsRef.current) / 1000;
      lastTsRef.current = now;
      const next = tRef.current + dt;
      if (next >= duration) {
        seek(duration);
        setPlaying(false);
        return;
      }
      seek(next);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, duration, seek]);

  // Listen for the driver's ready/error messages.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.ns !== "ptvs") return;
      if (d.type === "ptvs-ready") {
        readyRef.current = true;
        setReady(true);
        setHasAnim(!!d.hasAnim);
        setPreviewError(null);
        seek(0);
      } else if (d.type === "ptvs-error") {
        setPreviewError(String(d.message || "Preview error"));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [seek]);

  // Reset on new source / settings.
  useEffect(() => {
    setPlaying(false);
    setT(0);
    tRef.current = 0;
    setReady(false);
    readyRef.current = false;
    setHasAnim(null);
    setPreviewError(null);
  }, [doc, duration]);

  const onIframeLoad = useCallback(() => {
    // Ask the driver to init; it replies ptvs-ready (works cross-origin via postMessage).
    let tries = 0;
    const ping = () => {
      if (readyRef.current || tries > 40) return;
      tries++;
      iframeRef.current?.contentWindow?.postMessage({ ns: "ptvs", type: "ptvs-init" }, "*");
      setTimeout(ping, 150);
    };
    ping();
  }, []);

  const toggle = () => {
    if (!ready) return;
    if (!playing && tRef.current >= duration - 0.001) seek(0);
    setPlaying((v) => !v);
  };
  const restart = () => { seek(0); setPlaying(true); };

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seek(frac * duration);
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 className="section-title">Live preview</h2>
        {hasAnim === true && <span className="badge">Deterministic</span>}
        {hasAnim === false && <span className="badge warn">Wall-clock fallback</span>}
      </div>

      <div className="preview-shell" style={{ aspectRatio: "16 / 9", maxHeight: "52vh", background: "#000" }}>
        {source ? (
          <div
            style={{
              aspectRatio: ASPECT_CSS[aspectRatio],
              height: "100%",
              margin: "0 auto",
              position: "relative",
            }}
          >
            <iframe
              key={doc.slice(0, 64) + duration}
              ref={iframeRef}
              title="animation preview"
              className="preview-frame"
              sandbox="allow-scripts"
              srcDoc={doc}
              onLoad={onIframeLoad}
            />
          </div>
        ) : (
          <div className="preview-loading">No animation yet — generate one from a prompt, or paste/upload HTML in the editor.</div>
        )}
        {!ready && source && (
          <div className="preview-loading">
            <span className="spinner" /> Preparing preview…
          </div>
        )}
      </div>
      {previewError && <div className="error-text">{previewError}</div>}
      {hasAnim === false && (
        <div className="notice warn">
          This source does not expose <code style={{ fontFamily: "var(--mono)" }}>window.anim.renderFrame</code>,
          so the preview plays on wall-clock time. It can still be rendered — the backend will record it live.
        </div>
      )}

      <div className="playback">
        <div className="transport">
          <button className="tbtn play" onClick={toggle} disabled={!ready} title={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button className="tbtn" onClick={restart} disabled={!ready} title="Restart">↺</button>
          <button className="tbtn" onClick={() => seek(0)} disabled={!ready} title="Back to start">|◀</button>
          <div className="time"><b>{formatTime(t)}</b> / {formatTime(duration)}</div>
        </div>
        <div className="progress-track" onClick={onScrub}>
          <div className="progress-fill" style={{ width: `${(t / duration) * 100}%` }} />
        </div>
        <div className="kv" style={{ marginTop: 8 }}>
          <span>Frames @ 30 FPS</span><b>{Math.round(duration * 30)}</b>
        </div>
      </div>
    </>
  );
}
