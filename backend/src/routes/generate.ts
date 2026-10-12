import { Router, type Request, type Response, type NextFunction } from "express";
import {
  generateAnimation,
  AiNotConfiguredError,
  AiProviderError,
} from "../ai/provider.js";
import { ValidationError } from "../util/validation.js";
import { config } from "../config.js";

export const generateRouter = Router();

generateRouter.post("/generate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // BYOK: the caller may supply their own provider credentials per request.
    // Used transiently for this request only — never stored or logged.
    const { prompt, duration, aspectRatio, apiKey, apiUrl, model } = req.body ?? {};
    const result = await generateAnimation(prompt, duration, aspectRatio, { apiKey, apiUrl, model });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Friendly 503 body when no AI key is available (server or browser). */
export function aiSetupHint() {
  return {
    error: "AI_NOT_CONFIGURED",
    message:
      "AI generation needs an API key. Add your own free key (Groq, OpenRouter, Gemini…) in the app's AI Settings, or set AI_API_KEY in backend/.env and restart.",
    docs: "README.md → Configuration",
    aiConfigured: config.aiApiKey.length > 0,
  };
}

export { AiNotConfiguredError, AiProviderError, ValidationError };
