import { useEffect, useRef, useState } from "react";
import {
  api,
  hashSource,
  RESOLUTIONS,
  type AspectRatio,
  type Duration,
  type Quality,
  type RenderJobStatus,
} from "../lib/api";

interface Props {
  source: string;
  duration: Duration;
  aspectRatio: AspectRatio;
  quality: Quality;
  canRender: boolean; // false when source lacks a deterministic interface
}

const TERMINAL = new Set(["done", "failed", "cancelled"]);

export default function RenderPanel({ source, duration, aspectRatio, quality, canRender }: Props) {
  const [width, height] = RESOLUTIONS[aspectRatio][quality];
  const [job, setJob] = useState<RenderJobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [renderedHash, setRenderedHash] = useState<string | null>(null);
  const pollRef = useRef<number>(0);

  const outOfSync = renderedHash !== null && hashSource(source) !== renderedHash;
  const busy = job !== null && !TERMINAL.has(job.status);

  const start = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const j = await api.startRender(source, duration, aspectRatio, width, height);
      setJob(j);
      setRenderedHash(hashSource(source));
    } catch (err) {
      const e = err as Error & { status?: number };
      setStartError(e.message + (e.status === 429 ? " — please wait and retry." : ""));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    try {
      const j = await api.cancelJob(job.id);
      setJob(j);
    } catch {
      /* polling will surface terminal state */
    }
  };

  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const j = await api.jobStatus(job.id);
        setJob(j);
      } catch {
        /* keep polling; transient network blips shouldn't kill the UI */
      }
    }, 1500);
    return () => window.clearInterval(pollRef.current);
  }, [job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadName = `prompt-video-${duration}s-${width}x${height}.mp4`;

  return (
    <div className="render-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 className="section-title">Render MP4</h2>
      </div>

      <div className="render-meta">
        <code>{duration}s</code>
        <code>{aspectRatio}</code>
        <code>{width}×{height}</code>
        <code>30 FPS</code>
        <code>{duration * 30} frames</code>
      </div>

      {outOfSync && job?.status === "done" && (
        <div className="notice warn" style={{ marginBottom: 10 }}>
          <strong>Out of sync.</strong> The source changed since this video was rendered.
          Render again to match the current code.
        </div>
      )}

      {startError && <div className="error-text" style={{ marginBottom: 10 }}>{startError}</div>}

      {!busy && (
        <button
          className="btn primary block"
          disabled={starting || !source || !canRender}
          onClick={start}
          title={!canRender ? "Source must expose window.anim.renderFrame for deterministic rendering" : undefined}
        >
          {starting && <span className="spinner" />}
          {starting ? "Starting render…" : job?.status === "done" && !outOfSync ? "Render again" : "Render MP4"}
        </button>
      )}
      {!canRender && source !== "" && (
        <div className="notice warn" style={{ marginTop: 10 }}>
          Rendering is disabled: the current source has no deterministic{" "}
          <code style={{ fontFamily: "var(--mono)" }}>renderFrame</code> interface.
        </div>
      )}

      {job && (
        <div style={{ marginTop: 12 }}>
          <div className="job-stage">
            {busy && <span className="spinner" style={{ borderTopColor: "var(--accent)" }} />}
            <span>{job.stage}</span>
          </div>
          {job.progress !== null ? (
            <>
              <div className="job-bar">
                <div className="job-fill" style={{ width: `${job.progress}%` }} />
              </div>
              <div className="job-sub">
                {job.progress}% · frame {job.framesDone}/{job.framesTotal}
              </div>
            </>
          ) : (
            busy && (
              <>
                <div className="job-bar"><div className="job-fill indeterminate" /></div>
                {job.status === "rendering" && (
                  <div className="job-sub">frame {job.framesDone}/{job.framesTotal}</div>
                )}
              </>
            )
          )}
          {job.error && <div className="error-text" style={{ marginTop: 8 }}>{job.error}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {busy && (
              <button className="btn danger small" onClick={cancel}>Cancel render</button>
            )}
            {job.status === "failed" && (
              <button className="btn small" onClick={start}>Retry</button>
            )}
            {job.status === "done" && job.downloadUrl && (
              <a className="btn primary block" href={api.downloadUrl(job.id)} download={downloadName}>
                ⬇ Download MP4
              </a>
            )}
          </div>
          {job.status === "done" && (
            <div className="kv" style={{ marginTop: 8 }}>
              <span>File</span><b>{downloadName}</b>
            </div>
          )}
        </div>
      )}

      <div className="notice" style={{ marginTop: 12 }}>
        Real pipeline: isolated Chromium captures every frame at exactly 30 FPS, then FFmpeg
        encodes H.264 (<code style={{ fontFamily: "var(--mono)" }}>yuv420p</code>,
        faststart) and FFprobe validates the output before download is offered.
      </div>
    </div>
  );
}
