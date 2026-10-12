# ── Prompt to Video Studio · backend production image ──────────────────────────
# Build context = backend/ directory (e.g. `docker build backend/`).
# Installs Playwright Chromium (+ system deps) and FFmpeg.
# See DEPLOY.md for Fly.io / Render.com steps.

# ── Stage 1: compile TypeScript ───────────────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app/backend
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: runtime (Chromium + FFmpeg, no devDependencies) ──────────────────
FROM node:20-slim
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# FFmpeg + basics Playwright needs at runtime (python3 is used by some
# playwright helpers; ca-certificates for HTTPS fetches).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Download Chromium and install its OS-level deps via apt.
RUN npx playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/backend/dist ./dist
RUN mkdir -p renders

# Platforms (Fly/Render) inject PORT; 8080 is the local default.
ENV PORT=8080
EXPOSE 8080

# Health check used by hosts that support it.
HEALTHCHECK --interval=60s --timeout=10s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
