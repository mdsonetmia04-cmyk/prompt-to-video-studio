# Deployment Guide — Prompt to Video Studio (ফ্রি সেটআপ)

> মূল ধারণা: **frontend যাবে Vercel-এ** (ফ্রি), **backend চলবে অন্য কোথাও** (তোমার PC বা ফ্রি সার্ভার)। Vercel-এর serverless ফাংশনে Chromium + FFmpeg + লম্বা render job চলে না — তাই backend আলাদা রাখতেই হবে।

---

## ১. কোড GitHub-এ পুশ করা

```bash
cd ~/workspace/prompt-to-video-studio
git init
git add .
git commit -m "Prompt to Video Studio"
# GitHub-এ নতুন repo বানাও (যেমন prompt-to-video-studio), তারপর:
git remote add origin https://github.com/<তোমার-username>/prompt-to-video-studio.git
git branch -M main
git push -u origin main
```

> ⚠️ `.env` ফাইলে আসল API key থাকলে কখনোই commit কোরো না। শুধু `.env.example` যাবে।

---

## ২. Frontend → Vercel (ফ্রি)

1. [vercel.com](https://vercel.com) → **Add New → Project** → GitHub repo `prompt-to-video-studio` Import করো।
2. **Root Directory**: `Edit` চাপো → **`frontend`** সিলেক্ট করো।
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - (Vercel এগুলো `frontend/` থেকে নিজে নিজে ধরে নেবে।)
3. **Environment Variables**-এ যোগ করো:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | তোমার backend-এর public URL, যেমন `https://abc123.trycloudflare.com` (নিচের Option A/B/C থেকে যেটা নেবে) |

4. **Deploy** চাপো।

> Vercel শুধু frontend serve করবে। Backend ছাড়া খুললে সাইট "Checking renderer…" দেখাবে — ভয় নেই, backend URL বসালেই ঠিক হয়ে যাবে। `frontend/vercel.json` ইতিমধ্যেই SPA rewrite হ্যান্ডল করে।

---

## ৩. Backend — তিনটি ফ্রি অপশন (যেকোনো একটা নাও)

### Option A — সবচেয়ে সহজ, সম্পূর্ণ ফ্রি: নিজের PC + Cloudflare Tunnel ✅ (প্রস্তাবিত)

তোমার PC-তেই backend চলবে, Cloudflare Tunnel সেটাকে public HTTPS URL দেবে। কোনো সার্ভার ভাড়া লাগে না।

**১. Backend চালাও:**
```bash
cd prompt-to-video-studio/backend
npm install
npx playwright install chromium   # প্রথমবার একবার
npm run build
npm start                          # :8787-তে চলবে
```

**২. `cloudflared` ইনস্টল করো** (অন্য terminal-এ):
- **Windows** (PowerShell): `winget install --id Cloudflare.cloudflared`
- **macOS**: `brew install cloudflared`
- **Linux (Debian/Ubuntu)**:
  ```bash
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
  sudo apt update && sudo apt install cloudflared
  ```

**৩. Tunnel চালাও:**
```bash
cloudflared tunnel --url http://localhost:8787
```
একটা URL পাবে, যেমন `https://random-words-123.trycloudflare.com` — **এটাই তোমার backend URL**। Vercel-এর `VITE_API_URL`-এ এটা বসাও।

**৪. Backend-এর CORS সেটিং:** `.env`-এ
```
CORS_ORIGINS=https://তোমার-vercel-site.vercel.app
```
দাও (যাতে তোমার Vercel সাইট backend-কে call করতে পারে)।

> ⚠️ **সৎ কথা:** PC বন্ধ বা ঘুমিয়ে গেলে backend-ও বন্ধ — তখন সাইটে render কাজ করবে না। ব্যবহার করার সময় PC চালু + `npm start` + tunnel চালু রাখতে হবে। প্রতিবার tunnel restart করলে URL বদলে যায় (ফ্রি quick tunnel-এর সীমা) — তখন Vercel-এ `VITE_API_URL` আপডেট করে Redeploy দিতে হবে।

---

### Option B — Fly.io (ফ্রি allowance, PC বন্ধ থাকলেও চলে)

Fly.io-তে Docker image হিসেবে backend deploy হবে — Chromium + FFmpeg সহ।

**১. Fly CLI ইনস্টল + লগইন:**
```bash
curl -L https://fly.io/install.sh | sh        # macOS/Linux
# Windows: PowerShell-এ: iwr https://fly.io/install.ps1 -useb | iex
fly auth login
```

**২. Deploy:**
```bash
cd prompt-to-video-studio/backend
fly launch --no-deploy     # app name দাও, fly.toml আপডেট হবে
fly secrets set AI_API_KEY="তোমার-key" \
  CORS_ORIGINS="https://তোমার-vercel-site.vercel.app"
fly deploy
```

**৩. URL নাও:**
```bash
fly open   # বা: fly status --url
```
যেমন `https://prompt-to-video-studio-backend.fly.dev` — এটা Vercel-এর `VITE_API_URL`-এ বসাও।

> ⚠️ **সৎ কথা:** Fly-এর আর স্থায়ী "always free" tier নেই — নতুন অ্যাকাউন্টে সীমিত ফ্রি usage allowance থাকে, তারপর পে-অ্যাজ-ইউ-গো। `fly.toml`-এ ১টি machine সবসময় চালু রাখা আছে (render job মাঝপথে মারা যাবে না) — এতে প্রতি মাসে কিছু খরচ/allowance পুড়বে। 720p render 1 GB RAM-এ চলে; **1080p-এর জন্য 2 GB লাগতে পারে** (`fly scale memory 2048`) — সেটা বেশি খরচের। ড্যাশবোর্ডে usage নজরে রাখো।

---

### Option C — Render.com (ফ্রি web service, সবচেয়ে কম ঝামেলার cloud)

**১.** GitHub-এ push করা repo নিয়ে Render dashboard → **New + → Blueprint** → repo সিলেক্ট করো। `render.yaml` পড়ে backend service বানিয়ে দেবে।

**২.** Dashboard-এ **Environment**-এ যাও → `AI_API_KEY`-তে আসল key বসাও, `CORS_ORIGINS`-এ তোমার Vercel URL বসাও।

**৩.** Deploy শেষে URL পাবে, যেমন `https://prompt-to-video-studio-backend.onrender.com` — এটা Vercel-এর `VITE_API_URL`-এ বসাও।

> ⚠️ **সৎ কথা:** ফ্রি tier-এ ১৫ মিনিট inactivity-র পর service **ঘুমিয়ে যায়** — প্রথম render request-এ ৩০–৬০ সেকেন্ড "জেগে ওঠার" দেরি হবে। ফ্রি disk-ও সীমিত, তবে `JOB_TTL_MINUTES=60` দিয়ে পুরনো job auto-cleanup হয় বলে সমস্যা হওয়ার কথা নয়। ভারী 1080p render ফ্রি tier-এ ধীর/ব্যর্থ হতে পারে।

---

## ৪. Backend Env Vars (সার্ভারে/ড্যাশবোর্ডে বসাবে — কোডে নয়)

| Key | দরকার? | উদাহরণ |
|---|---|---|
| `AI_API_KEY` | ঐচ্ছিক | ফ্রি key (নিচে দেখো)। **না থাকলে demo mode** — `/api/generate` 503 দেয়, কিন্তু built-in demo animation দিয়ে preview + render পুরো চলে। |
| `AI_API_URL` | key থাকলে | `https://api.groq.com/openai/v1` |
| `AI_MODEL` | key থাকলে | `llama-3.3-70b-versatile` |
| `PORT` | Fly/Render নিজে দেয় | local-এ `8787` |
| `CORS_ORIGINS` | হ্যাঁ (deploy-এ) | `https://তোমার-site.vercel.app` |
| `JOB_TTL_MINUTES` | ঐচ্ছিক | `60` (পুরনো render file auto-delete) |
| `RENDER_TIMEOUT_MINUTES` | ঐচ্ছিক | `10` |

> 🔑 **Keys কখনোই Git-এ commit কোরো না।** Vercel / Fly (`fly secrets set`) / Render — সব জায়গায় dashboard/CLI-তে env var হিসেবে দাও।

---

## ৫. ফ্রি AI Key (OpenAI-compatible adapter বলে যেকোনোটা চলে)

| Source | কীভাবে key নেবে | `AI_API_URL` | `AI_MODEL` (উদাহরণ) |
|---|---|---|---|
| **Groq** (ফ্রি tier) | [console.groq.com](https://console.groq.com) → API Keys | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| **OpenRouter** (`:free` models) | [openrouter.ai](https://openrouter.ai) → Keys | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct:free` |
| **Google AI Studio** (ফ্রি key) | [aistudio.google.com](https://aistudio.google.com) → Get API key | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |

Adapter OpenAI-এর chat-completions contract ফলো করে — key ছাড়া clean 503 দেয়, ভুয়া success দেখায় না।

---

## ৬. যাচাই (deploy-এর পর)

1. Vercel URL খোলো → renderer status **"Renderer ready"** দেখাবে।
2. **Use demo animation** → preview-তে animation চলবে।
3. **Render MP4** চাপো → job `done` হলে **Download MP4** থেকে আসল file নামবে।
4. Backend health: `<backend-url>/api/health` → `{"ok":true,...}` (প্রায়)।

সমস্যা হলে: `README.md`-এর Troubleshooting দেখো; backend log-এ (`fly logs` / Render Logs / local terminal) আসল error থাকে, frontend-এ শুধু সহজ message দেখায়।
