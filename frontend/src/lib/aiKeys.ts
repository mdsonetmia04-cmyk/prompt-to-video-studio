/** BYOK: browser-stored AI provider settings (localStorage only, never on the server). */

export interface AiPreset {
  id: string;
  label: string;
  apiUrl: string;
  model: string;
  keyHint: string;
  keyUrl: string;
}

export const AI_PRESETS: AiPreset[] = [
  {
    id: "groq",
    label: "Groq (free tier)",
    apiUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    keyHint: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter (:free models)",
    apiUrl: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    keyHint: "sk-or-v1-…",
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    id: "gemini",
    label: "Google AI Studio (Gemini, free)",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-2.0-flash",
    keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "mistral",
    label: "Mistral (free tier)",
    apiUrl: "https://api.mistral.ai/v1",
    model: "mistral-large-latest",
    keyHint: "…",
    keyUrl: "https://console.mistral.ai/api-keys",
  },
  { id: "custom", label: "Custom (OpenAI-compatible)", apiUrl: "", model: "", keyHint: "…", keyUrl: "" },
];

export interface AiBrowserSettings {
  presetId: string;
  apiKey: string;
  apiUrl: string;
  model: string;
}

const LS_KEY = "ptvs-ai-settings";

export function loadAiSettings(): AiBrowserSettings | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<AiBrowserSettings>;
    if (!s.apiKey || typeof s.apiKey !== "string") return null;
    return {
      presetId: typeof s.presetId === "string" ? s.presetId : "custom",
      apiKey: s.apiKey,
      apiUrl: typeof s.apiUrl === "string" ? s.apiUrl : "",
      model: typeof s.model === "string" ? s.model : "",
    };
  } catch {
    return null;
  }
}

export function saveAiSettings(s: AiBrowserSettings): void {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

export function clearAiSettings(): void {
  localStorage.removeItem(LS_KEY);
}

export function presetById(id: string): AiPreset | undefined {
  return AI_PRESETS.find((p) => p.id === id);
}
