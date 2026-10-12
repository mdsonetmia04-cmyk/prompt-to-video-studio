import { config, type Duration } from "../config.js";
import { validatePrompt } from "../util/validation.js";

export interface GenerateResult {
  source: string;
  deterministic: boolean;
  model: string;
  note: string;
}

export class AiNotConfiguredError extends Error {
  status = 503;
  code = "AI_NOT_CONFIGURED";
  constructor() {
    super(
      "AI generation is not configured. Either set AI_API_KEY (and optionally AI_API_URL / AI_MODEL) in backend/.env " +
        "and restart the backend, or add your own free provider key in the app's AI Settings (browser key, sent per request only)."
    );
    this.name = "AiNotConfiguredError";
  }
}

export class AiProviderError extends Error {
  status = 502;
  code = "AI_PROVIDER_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

const SYSTEM_PROMPT = `You are an expert creative developer who writes self-contained animated HTML scenes for a deterministic video renderer.

OUTPUT CONTRACT — follow exactly:
1. Output ONLY a single complete HTML document. No markdown fences, no explanations, no commentary — the raw HTML only, starting with <!DOCTYPE html>.
2. The document must be FULLY SELF-CONTAINED: no external URLs, no CDN scripts, no webfonts, no images, no network requests of any kind. Use only inline <style> and <script>. System font stacks only.
3. The page body must fill the viewport (html, body { margin:0; width:100vw; height:100vh; overflow:hidden }) and the animation must adapt to ANY viewport size/aspect ratio via window.innerWidth / innerHeight (recompute layout in init and on resize).
4. Expose a DETERMINISTIC animation interface on window:
     window.anim = {
       init() { /* build scene, reset all state to t=0 */ },
       renderFrame(t) { /* draw the exact state at time t (seconds, float) */ },
       dispose() { /* release listeners/timers */ }
     };
   - renderFrame(t) must be a PURE function of t: calling renderFrame(2.5) twice must produce pixel-identical output. Do NOT use Math.random() (use a seeded PRNG with a fixed seed), Date.now(), performance.now(), setTimeout, setInterval, or requestAnimationFrame inside the scene logic.
   - Prefer <canvas> 2D rendering driven entirely by t. CSS keyframe animations are allowed only for decoration that does not affect the main timeline.
   - init() must be idempotent (safe to call twice) and dispose() must clean up.
5. The scene is a short cinematic loop-free clip of the requested duration. Design a clear beginning, middle, and polished END FRAME that holds for the final ~2 seconds (the end frame is what viewers remember).
6. Keep total output under ~60 KB. Prefer procedural drawing (particles, gradients, shapes, typography) over verbose markup.
7. Visual quality bar: premium motion-graphics look — eased motion (easeInOutCubic etc.), layered depth, subtle grain/vignette allowed, restrained color palette, crisp typography with letter-spacing. Avoid default-looking shapes and linear motion.
8. Never include <script src=...>, <link rel=stylesheet href=...>, @import, fetch(), XMLHttpRequest, WebSocket, or eval of remote code. No prompt()/alert()/confirm().

If the user's prompt is vague, invent tasteful details that fit the requested mood and duration.`;

function buildUserPrompt(prompt: string, duration: Duration, aspectRatio: string): string {
  return (
    `Create a ${duration}-second animated scene for a ${aspectRatio} video canvas.\n\n` +
    `User prompt: ${prompt}\n\n` +
    `Remember: output ONLY the raw HTML document implementing window.anim = { init(), renderFrame(t), dispose() } as specified.`
  );
}

/** Strip accidental markdown fences so we always store raw HTML. */
export function extractHtml(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:html)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) s = fence[1].trim();
  return s;
}

/** Per-request caller credentials (BYOK). The key is used transiently for this
 *  one request only — never stored, never logged. */
export interface AiCredentialOverrides {
  apiKey?: unknown;
  apiUrl?: unknown;
  model?: unknown;
}

interface ResolvedCredentials {
  apiKey: string;
  apiUrl: string;
  model: string;
  fromBrowser: boolean;
}

function cleanStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** HTTPS-only, bounded provider URL. Falls back to the server default. */
function cleanApiUrl(v: unknown, fallback: string): string {
  const u = cleanStr(v, 200);
  if (/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?$/.test(u)) return u;
  return fallback;
}

function resolveCredentials(overrides?: AiCredentialOverrides): ResolvedCredentials {
  const browserKey = cleanStr(overrides?.apiKey, 500);
  if (browserKey) {
    return {
      apiKey: browserKey,
      apiUrl: cleanApiUrl(overrides?.apiUrl, config.aiApiUrl),
      model: cleanStr(overrides?.model, 120) || config.aiModel,
      fromBrowser: true,
    };
  }
  if (!config.aiApiKey) throw new AiNotConfiguredError();
  return { apiKey: config.aiApiKey, apiUrl: config.aiApiUrl, model: config.aiModel, fromBrowser: false };
}

export async function generateAnimation(
  promptInput: unknown,
  durationInput: unknown,
  aspectInput: unknown,
  credentialOverrides?: AiCredentialOverrides
): Promise<GenerateResult> {
  const prompt = validatePrompt(promptInput);
  const duration = durationInput === 5 ? 5 : durationInput === 12 ? 12 : 10;
  const aspectRatio = aspectInput === "9:16" || aspectInput === "1:1" ? aspectInput : "16:9";

  const creds = resolveCredentials(credentialOverrides);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutSeconds * 1000);
  try {
    const res = await fetch(`${creds.apiUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: JSON.stringify({
        model: creds.model,
        temperature: 0.7,
        max_tokens: config.aiMaxTokens,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(prompt, duration, aspectRatio) },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AiProviderError(`AI provider returned HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (data.error?.message) throw new AiProviderError(`AI provider error: ${data.error.message.slice(0, 300)}`);
    const raw = data.choices?.[0]?.message?.content ?? "";
    const source = extractHtml(raw);
    if (!source.toLowerCase().includes("<html")) {
      throw new AiProviderError("AI provider did not return a valid HTML document.");
    }
    const bytes = Buffer.byteLength(source, "utf8");
    if (bytes > 2 * 1024 * 1024) throw new AiProviderError("Generated source exceeds the 2 MB limit.");
    return {
      source,
      deterministic: /window\s*\.\s*anim|renderFrame/.test(source),
      model: creds.model,
      note: creds.fromBrowser
        ? "Generated with your browser-provided API key (not stored on the server). Review the code in the editor before rendering."
        : "Review the generated code in the editor before rendering.",
    };
  } catch (err) {
    if (err instanceof AiProviderError || err instanceof AiNotConfiguredError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new AiProviderError(`AI request timed out after ${config.aiTimeoutSeconds}s.`);
    }
    throw new AiProviderError(`AI request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
