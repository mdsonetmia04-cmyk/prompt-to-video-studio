import { Router, type Request, type Response, type NextFunction } from "express";
import {
  generateAnimation,
  AiNotConfiguredError,
  AiProviderError,
} from "../ai/provider.js";
import { DEMO_SOURCE, DEMO_META } from "../ai/demoAnimation.js";
import { ValidationError } from "../util/validation.js";
import { config } from "../config.js";

export const generateRouter = Router();

/** Built-in demo animation so preview + rendering work with no AI key. */
generateRouter.get("/demo", (_req: Request, res: Response) => {
  res.json({ source: DEMO_SOURCE, meta: DEMO_META, deterministic: true });
});

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

/** Friendly 503 body for the demo-mode path the frontend can render. */
export function aiSetupHint() {
  return {
    error: "AI_NOT_CONFIGURED",
    message:
      "AI generation is not configured on this server. Set AI_API_KEY in backend/.env (see .env.example) and restart.",
    demoAvailable: true,
    demoEndpoint: "/api/demo",
    docs: "README.md → Configuration",
    aiConfigured: config.aiApiKey.length > 0,
  };
}

export { AiNotConfiguredError, AiProviderError, ValidationError };
