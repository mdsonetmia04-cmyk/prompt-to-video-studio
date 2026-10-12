export type Duration = 10 | 12;
export type AspectRatio = "16:9" | "9:16" | "1:1";
export type Quality = "720p" | "1080p";

export const RESOLUTIONS: Record<AspectRatio, Record<Quality, [number, number]>> = {
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080] },
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080] },
};

export const EXAMPLE_PROMPTS = [
  "Create a premium 12-second logo reveal animation with a dark background, elegant green particles, smooth typography, cinematic transitions, and a clean final logo frame.",
  "A 10-second kinetic typography opener: bold white words slide and stagger in over a charcoal background with a thin green accent line, ending on the phrase “MAKE IT MOVE”.",
  "10-second abstract loop intro: flowing green aurora waves over near-black, soft glow, vignette, calm and premium.",
  "A 12-second product-card animation: a minimal dark card flips in, feature bullets tick in one by one with a green check accent, ends on a clean price frame.",
];

export interface RenderJobStatus {
  id: string;
  status:
    | "queued"
    | "preparing"
    | "rendering"
    | "encoding"
    | "validating"
    | "done"
    | "failed"
    | "cancelled";
  stage: string;
  progress: number | null;
  error: string | null;
  settings: { duration: Duration; aspectRatio: AspectRatio; width: number; height: number };
  framesTotal: number;
  framesDone: number;
  downloadUrl: string | null;
}

async function handle<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(
      (data.error as string) || (data.message as string) || `Request failed (${res.status})`
    ) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data as T;
}

/**
 * Base URL of the render backend.
 * - Local dev: "" (Vite proxies same-origin /api -> http://localhost:8787).
 * - Deployed: set VITE_API_URL to the public backend URL (e.g. https://xyz.trycloudflare.com).
 * Missing/unset falls back to same-origin "" so the app still builds and
 * shows its normal "checking renderer…" state when no backend is reachable.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const u = (path: string) => `${API_BASE}${path}`;

export const api = {
  health: () => fetch(u("/api/health")).then((r) => handle<Record<string, unknown>>(r)),
  aiStatus: () =>
    fetch(u("/api/ai-status")).then((r) =>
      handle<{ aiConfigured: boolean; error: string; message: string; demoAvailable: boolean }>(r)
    ),
  demo: () =>
    fetch(u("/api/demo")).then((r) =>
      handle<{ source: string; meta: { name: string; description: string } }>(r)
    ),
  generate: (prompt: string, duration: Duration, aspectRatio: AspectRatio) =>
    fetch(u("/api/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, duration, aspectRatio }),
    }).then((r) => handle<{ source: string; deterministic: boolean; model: string; note: string }>(r)),
  startRender: (source: string, duration: Duration, aspectRatio: AspectRatio, width: number, height: number) =>
    fetch(u("/api/render"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, duration, aspectRatio, width, height, fps: 30 }),
    }).then((r) => handle<RenderJobStatus>(r)),
  jobStatus: (id: string) => fetch(u(`/api/render/${id}`)).then((r) => handle<RenderJobStatus>(r)),
  cancelJob: (id: string) =>
    fetch(u(`/api/render/${id}/cancel`), { method: "POST" }).then((r) => handle<RenderJobStatus>(r)),
  downloadUrl: (id: string) => `${API_BASE}/api/render/${id}/download`,
};

/** Inject the deterministic preview driver into generated source. */
export function buildPreviewDoc(source: string): string {
  const driver = `<script>
(function () {
  function send(msg) { try { window.parent.postMessage(Object.assign({ ns: "ptvs" }, msg), "*"); } catch (e) {} }
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.ns !== "ptvs") return;
    if (d.type === "ptvs-init") {
      var hasAnim = !!(window.anim && typeof window.anim.renderFrame === "function");
      if (hasAnim) { try { window.anim.init(); } catch (err) { send({ type: "ptvs-error", message: String(err && err.message || err) }); } }
      send({ type: "ptvs-ready", hasAnim: hasAnim });
    } else if (d.type === "ptvs-seek") {
      if (window.anim && typeof window.anim.renderFrame === "function") {
        try { window.anim.renderFrame(d.t); } catch (err) {}
      }
    } else if (d.type === "ptvs-dispose") {
      if (window.anim && typeof window.anim.dispose === "function") { try { window.anim.dispose(); } catch (err) {} }
    }
  });
})();
<\/script>`;
  if (/<\/body\s*>/i.test(source)) return source.replace(/<\/body\s*>/i, driver + "</body>");
  if (/<\/html\s*>/i.test(source)) return source.replace(/<\/html\s*>/i, driver + "</html>");
  return source + driver;
}

export function hashSource(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const tenths = Math.floor((t % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${tenths}`;
}
