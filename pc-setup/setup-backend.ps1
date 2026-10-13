# ── Prompt to Video Studio · one-click backend setup (Windows) ──────────────────
# Double-click this file. It will:
#   1. Check Node.js, FFmpeg, cloudflared (tells you what to install if missing)
#   2. Download/update the project from GitHub
#   3. Configure backend/.env (CORS for your Vercel site)
#   4. Install dependencies + Chromium, build, and start the backend
# Keep this window open while you use the app. Close it to stop the backend.

$ErrorActionPreference = "Stop"
$VercelUrl1 = "https://prompt-to-video-studio.vercel.app"
$VercelUrl2 = "https://prompt-to-video-studio-sonet4.vercel.app"

function Need($cmd, $installHint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "MISSING: $cmd" -ForegroundColor Red
    Write-Host "Install it with: $installHint" -ForegroundColor Yellow
    Write-Host "Then close this window and double-click setup-backend.ps1 again."
    Read-Host "Press Enter to exit"
    exit 1
  }
}

Write-Host "=== Prompt to Video Studio · backend setup ===" -ForegroundColor Green
Need "node"    "winget install OpenJS.NodeJS.LTS  (then reopen PowerShell)"
Need "ffmpeg"  "winget install ffmpeg"
Need "git"     "winget install Git.Git"

$nodeVer = (node --version)
Write-Host "Node $nodeVer OK" -ForegroundColor Green

$workDir = Join-Path $HOME "prompt-to-video-studio"
if (-not (Test-Path $workDir)) {
  Write-Host "Cloning project..."
  git clone https://github.com/mdsonetmia04-cmyk/prompt-to-video-studio.git $workDir
} else {
  Write-Host "Updating project..."
  git -C $workDir pull --ff-only
}

Set-Location (Join-Path $workDir "backend")

if (-not (Test-Path ".env")) {
  Copy-Item "..\.env.example" ".env"
  Write-Host ".env created from template."
}
# Always (re)apply the CORS origins for the live Vercel frontend:
$envText = Get-Content ".env" -Raw
$envText = $envText -replace '(?m)^CORS_ORIGINS=.*$', "CORS_ORIGINS=$VercelUrl1,$VercelUrl2"
if ($envText -notmatch '(?m)^CORS_ORIGINS=') { $envText += "`nCORS_ORIGINS=$VercelUrl1,$VercelUrl2`n" }
Set-Content ".env" $envText
Write-Host "CORS origins set for your Vercel site." -ForegroundColor Green
Write-Host "(Optional) To enable AI prompt generation, edit .env and set AI_API_KEY." -ForegroundColor DarkGray

Write-Host "Installing dependencies (first run takes a few minutes)..."
npm install
Write-Host "Installing Chromium for rendering..."
npx playwright install chromium
Write-Host "Building backend..."
npm run build

# Frontend: build the web app so the backend can serve it all-in-one
# (same-origin /api — no tunnel or CORS needed). VITE_API_URL must be empty
# for the local build so the app talks to this same server.
Set-Location (Join-Path $workDir "frontend")
$env:VITE_API_URL = ""
Write-Host "Installing frontend dependencies..."
npm install
Write-Host "Building frontend..."
npm run build
Set-Location (Join-Path $workDir "backend")

Write-Host ""
Write-Host "=== Backend + app are starting on http://localhost:8787 ===" -ForegroundColor Green
Write-Host "Open http://localhost:8787 in your browser — the full studio runs there." -ForegroundColor Green
Write-Host "Check: http://localhost:8787/api/health  (expect status ok)"
Write-Host "No tunnel or Vercel changes needed for local use. Keep THIS window open."
Write-Host "(The start-tunnel.ps1 + Vercel VITE_API_URL route is still available as a backup.)"
npm start
