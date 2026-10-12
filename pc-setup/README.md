# Run the backend on your own PC (Windows) — 3 double-clicks

This makes renders much faster than the free Render.com tier, because your PC's
CPU/RAM does the work. The Vercel frontend stays as-is; only the backend moves.

## One-time prerequisites (PowerShell)

```powershell
winget install OpenJS.NodeJS.LTS
winget install ffmpeg
winget install Git.Git
winget install cloudflare.cloudflared
```

Close and reopen PowerShell after installing.

## Every time you want to use the app

1. **Double-click `setup-backend.ps1`** — downloads/updates the project, installs
   everything, and starts the backend on http://localhost:8787
   (check http://localhost:8787/api/health → `{"status":"ok"...}`).
   First run takes ~5–10 minutes; later runs are fast.
2. **Double-click `start-tunnel.ps1`** — copy the `https://....trycloudflare.com` URL.
3. **Vercel** → project → Settings → Environment Variables → set `VITE_API_URL`
   to that URL → Save → Deployments → Redeploy.

Keep both PowerShell windows open while using the app. The tunnel URL changes
every time you restart `start-tunnel.ps1` — update `VITE_API_URL` in Vercel
and redeploy when it does.

## Optional: AI prompt generation

Edit `backend/.env` and set `AI_API_KEY` (plus `AI_API_URL` / `AI_MODEL` for
Groq, OpenRouter `:free`, or Google AI Studio). Without a key the app runs in
demo mode: preview + real MP4 rendering still work.
