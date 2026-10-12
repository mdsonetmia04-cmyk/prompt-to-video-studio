# ── Prompt to Video Studio · public tunnel (Windows) ────────────────────────────
# Run this AFTER setup-backend.ps1 is running.
# It prints a public https://....trycloudflare.com URL.
# Copy that URL into Vercel → Settings → Environment Variables → VITE_API_URL,
# then Redeploy. Keep this window open too.

$ErrorActionPreference = "Stop"
if (-not (Get-Command "cloudflared" -ErrorAction SilentlyContinue)) {
  Write-Host "MISSING: cloudflared" -ForegroundColor Red
  Write-Host "Install it with: winget install cloudflare.cloudflared" -ForegroundColor Yellow
  Write-Host "Then double-click start-tunnel.ps1 again."
  Read-Host "Press Enter to exit"
  exit 1
}
Write-Host "Opening public tunnel for http://localhost:8787 ..." -ForegroundColor Green
Write-Host "Copy the https://....trycloudflare.com URL into Vercel as VITE_API_URL, then Redeploy." -ForegroundColor Yellow
cloudflared tunnel --url http://localhost:8787
