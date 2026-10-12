/** Client-side validation for user-supplied animation HTML. */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

const MAX_BYTES = 2 * 1024 * 1024;

export function validateAnimationHtml(source: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  const s = source ?? "";

  if (!s.trim()) {
    errors.push("The document is empty. Paste HTML or upload an .html file.");
    return { ok: false, errors, warnings, info };
  }

  const bytes = new Blob([s]).size;
  if (bytes > MAX_BYTES) errors.push(`Source is ${(bytes / 1048576).toFixed(1)} MB — the 2 MB limit is exceeded.`);

  const lower = s.toLowerCase();
  if (!lower.includes("<html")) errors.push("Missing <html> tag — paste a complete HTML document.");
  if (!/<body[\s>]/.test(lower)) warnings.push("No <body> tag found — the preview driver may not attach correctly.");

  // Deterministic animation interface (what the seek-mode renderer drives).
  // Sources WITHOUT it still render — the backend records the page live on
  // wall-clock time instead — so this is a warning, not an error.
  const hasAnim = /window\s*\.\s*anim/.test(s);
  const hasRenderFrame = /renderFrame\s*\(\s*[a-zA-Z_$][\w$]*\s*\)/.test(s);
  const hasInit = /init\s*\(\s*\)/.test(s);
  const hasDispose = /dispose\s*\(\s*\)/.test(s);
  if (!hasAnim || !hasRenderFrame) {
    warnings.push(
      "No deterministic animation interface (window.anim.renderFrame) — the renderer will record the page live instead of frame-seeking. Timing will be approximate; for frame-perfect output expose window.anim = { init(), renderFrame(t), dispose() }."
    );
  } else {
    info.push("Deterministic interface detected (window.anim.renderFrame).");
    if (!hasInit) warnings.push("window.anim.init() not found — the scene may not reset cleanly.");
    if (!hasDispose) warnings.push("window.anim.dispose() not found — minor; only matters for cleanup.");
  }

  // Non-determinism hazards.
  if (/\bMath\s*\.\s*random\s*\(/.test(s))
    warnings.push("Math.random() detected — use a seeded PRNG with a fixed seed, otherwise frames won't match on re-render.");
  if (/\b(Date\s*\.\s*now|performance\s*\.\s*now)\s*\(/.test(s))
    warnings.push("Date.now()/performance.now() detected — renderFrame(t) must be a pure function of t.");
  if (/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/.test(s))
    warnings.push("Timers/animation-frame calls detected — the renderer seeks with renderFrame(t); timers won't follow the seek.");

  // Blocked / external resources (rendering is offline — these would fail or hang).
  const extScript = /<script[^>]+src\s*=\s*["']https?:/i.test(s);
  const extStyle = /<link[^>]+href\s*=\s*["']https?:/i.test(s);
  const extImport = /@import\s+url\(/i.test(s);
  const fetchCall = /\bfetch\s*\(/.test(s);
  if (extScript) errors.push("External <script src> found — the renderer runs offline; inline all scripts.");
  if (extStyle) errors.push("External stylesheet <link> found — inline all CSS in <style>.");
  if (extImport) errors.push("@import url(...) found — inline all CSS.");
  if (fetchCall) warnings.push("fetch() detected — network is blocked during rendering; it will fail.");
  if (/\b(prompt|alert|confirm)\s*\(/.test(s))
    warnings.push("prompt()/alert()/confirm() detected — dialogs block headless rendering.");

  // Viewport sizing.
  if (!/100vw|100vh|innerWidth|innerHeight/.test(s))
    warnings.push("No viewport-relative sizing detected — the scene should fill any viewport (100vw/100vh or window.innerWidth/Height).");

  return { ok: errors.length === 0, errors, warnings, info };
}
