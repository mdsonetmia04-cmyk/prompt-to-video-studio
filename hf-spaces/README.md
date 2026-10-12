---
title: Prompt to Video Studio Backend
emoji: 🎬
colorFrom: green
colorTo: black
sdk: docker
app_port: 7860
pinned: false
---

# Prompt to Video Studio · Backend (Hugging Face Spaces)

Render backend for [Prompt to Video Studio](https://github.com/mdsonetmia04-cmyk/prompt-to-video-studio):
AI animation generation, deterministic Playwright/Chromium frame capture, FFmpeg H.264 MP4 encoding.

## Space repo layout (required)

```
Dockerfile        ← copy from hf-spaces/Dockerfile in the main repo
README.md         ← this file (keep the frontmatter above)
backend/          ← copy of the backend/ directory from the main repo
```

## Required secrets (Space → Settings → Variables and secrets)

| Variable | Value |
|---|---|
| `CORS_ORIGINS` | `https://prompt-to-video-studio.vercel.app,https://prompt-to-video-studio-sonet4.vercel.app` |
| `AI_API_KEY` | _(optional)_ OpenAI-compatible API key; empty = demo mode |

## Verify

Open `https://<your-username>-<space-name>.hf.space/api/health` — expect `{"status":"ok",...}`.

## Notes

- Free Spaces sleep after inactivity; the first request wakes the Space (takes ~1–2 min).
- Point the Vercel frontend's `VITE_API_URL` at the Space URL and redeploy.
