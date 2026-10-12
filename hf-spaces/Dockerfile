# ── Prompt to Video Studio · backend on Hugging Face Spaces (Docker) ─────────────
# This file goes at the ROOT of your Hugging Face Space repo (named "Dockerfile"),
# alongside a copy of the project's backend/ directory.
# The Space listens on port 7860 (required by HF Spaces).
# Set CORS_ORIGINS in Space Settings → Variables and secrets.

# ── Stage 1: compile TypeScript ───────────────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ── Stage 2: runtime (Chromium + FFmpeg, no devDependencies) ──────────────────
FROM node:20-slim
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=7860

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

RUN npx playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/backend/dist ./dist
RUN mkdir -p renders

EXPOSE 7860
CMD ["node", "dist/server.js"]
