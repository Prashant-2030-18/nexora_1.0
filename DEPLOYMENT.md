# NEXORA — Zero-Cost SIH Production Deployment Guide

> **Target cost**: ₹0/month  
> **Platform**: Vercel (frontend) + Render Free (backend) + Supabase Free (database + storage)  
> **Hackathon**: Smart India Hackathon 2026 — PS ID: SIH26002

---

## Architecture

```
USER (browser)
  │ HTTPS
  ▼
VERCEL HOBBY (FREE)
  React 18 / Vite / TypeScript NEXORA frontend
  │ HTTPS REST
  ▼
RENDER FREE WEB SERVICE
  FastAPI NEXORA API (Python 3.11, Uvicorn)
  │                          │
  ▼                          ▼
SUPABASE FREE           SUPABASE FREE
PostgreSQL DB           Storage Bucket
(ner-smartlogix)        (citizen-evidence)

FastAPI also connects to:
  ├── NDMA SACHET (official CAP XML feed)
  ├── OSRM (public routing — router.project-osrm.org)
  └── Open-Meteo (free weather fallback)

Browser:
  ├── GPS (navigator.geolocation)
  ├── IndexedDB (offline route/hazard cache)
  ├── MapLibre GL (3D vector navigation — free)
  └── Leaflet + OpenStreetMap (2D fallback — free)

SMS: Simulation (no cost)
Satellite: Simulation (no cost)
Google Maps: Optional — only if VITE_GOOGLE_MAPS_API_KEY is provided
```

---

## Deploy Order

1. Create Supabase project
2. Set up PostgreSQL database
3. Set up Storage bucket
4. Prepare Git repository
5. Deploy backend to Render
6. Deploy frontend to Vercel
7. Set FRONTEND_ORIGIN in Render
8. End-to-end test

---

## Step 1 — Supabase Setup

1. Go to [supabase.com](https://supabase.com) → Create a free account
2. **New Project** → Choose any region → Set a database password (save it!)
3. Once created, go to **Settings → Database**
4. Copy the **Connection string (URI)** → looks like:
   ```
   postgresql://postgres:PASSWORD@db.XXXXX.supabase.co:5432/postgres
   ```
   Save this as `DATABASE_URL`.

5. Go to **Settings → API**
   - Copy **Project URL** → save as `SUPABASE_URL`
   - Copy **service_role key** (under "Project API keys") → save as `SUPABASE_SERVICE_ROLE_KEY`
   - ⚠️ The `service_role` key is a backend-only secret — NEVER put it in Vercel env vars

6. Go to **Storage** → **New Bucket**
   - Name: `citizen-evidence`
   - Make it **Private** (not public)
   - Save as `SUPABASE_STORAGE_BUCKET=citizen-evidence`

---

## Step 2 — Backend Render Deployment

1. Push your code to GitHub (ensure `.gitignore` is in place — secrets excluded)
2. Go to [render.com](https://render.com) → Create a free account
3. **New → Web Service** → Connect your GitHub repository
4. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: Free
   - **Health Check Path**: `/health`

5. Under **Environment Variables**, add all secrets (one by one — never commit these):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `postgresql://...` (from Supabase) |
   | `NER_SECRET_KEY` | Generate a strong random string (32+ chars) |
   | `FRONTEND_ORIGIN` | `https://your-nexora-app.vercel.app` (set after Vercel deploy) |
   | `SUPABASE_URL` | `https://xxx.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
   | `SUPABASE_STORAGE_BUCKET` | `citizen-evidence` |
   | `GEMINI_API_KEY` | (optional) |
   | `OPENWEATHER_API_KEY` | (optional) |
   | `GOOGLE_MAPS_API_KEY` | (optional) |
   | `ADMIN_EMAIL` | (optional) Admin account email |
   | `ADMIN_PASSWORD` | (optional) Admin account password |
   | `ENVIRONMENT` | `production` |
   | `SMS_PROVIDER` | `simulation` |
   | `SATELLITE_PROVIDER` | `simulation` |

6. **Deploy** → Wait for build to complete (~2-3 minutes)

7. Verify: open `https://your-backend.onrender.com/health`  
   Expected response:
   ```json
   {"status": "ok", "service": "nexora-api", "environment": "production", "storage": "supabase"}
   ```

> **Note**: Render Free sleeps after 15 minutes of inactivity. The first request may take 30-60 seconds to wake up. NEXORA frontend handles this gracefully — it shows "CONNECTING TO NEXORA SERVICES..." while waiting.

---

## Step 3 — Frontend Vercel Deployment

1. Go to [vercel.com](https://vercel.com) → Create a free account → Import GitHub repository
2. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

3. Under **Environment Variables**, add:

   | Variable | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://your-backend.onrender.com` |
   | `VITE_ENABLE_GOOGLE_MAPS` | `false` (or `true` if you have a key) |
   | `VITE_GOOGLE_MAPS_API_KEY` | (optional) |
   | `VITE_ENABLE_DEMO_COMMUNICATION` | `true` |

4. **Deploy** → Vercel will auto-detect `frontend/vercel.json` for SPA routing

5. Note your Vercel URL: `https://your-nexora-app.vercel.app`

---

## Step 4 — Cross-Link CORS

1. Back in **Render → Environment** → Update `FRONTEND_ORIGIN`:
   ```
   https://your-nexora-app.vercel.app
   ```
   (If you have multiple preview URLs, comma-separate them)

2. **Manual Deploy** to apply the CORS change

---

## Step 5 — End-to-End Verification

Test each item below and mark PASS/FAIL:

| # | Test | Expected |
|---|------|----------|
| 1 | `GET /health` on backend URL | `{"status": "ok"}` |
| 2 | Open frontend Vercel URL | Loads without blank screen |
| 3 | Hard refresh `/dashboard` | No React Router 404 |
| 4 | Register with name + email + mobile + password | Account created |
| 5 | Login | JWT token issued |
| 6 | Dashboard loads | Tiles and map visible |
| 7 | SACHET disaster sync | Real NDMA data or honest "unavailable" |
| 8 | Calculate route | Route geometry returned |
| 9 | Click Start Navigation | Full-screen nav opens (no undefined LatLng) |
| 10 | GPS permission | Location tracked |
| 11 | Speed display | "X km/h LIVE GPS" or "0 km/h STATIONARY" (never "-- CALCULATED_GPS") |
| 12 | Submit citizen report with photo | Report saved to PostgreSQL, photo to Supabase Storage |
| 13 | Restart backend on Render | Photo still accessible (not lost from ephemeral disk) |
| 14 | SMS simulation trigger | UI shows "SIMULATION" badge |
| 15 | Satellite simulation | UI shows "SIMULATION" badge |

---

## Free Tier Limitations (Honest Disclosure)

| Item | Limitation |
|---|---|
| **Render Free** | Sleeps after 15 min inactivity. Cold start ~30-60s. |
| **Supabase Free** | 500 MB database, 1 GB storage, project pauses after 1 week inactivity. |
| **Vercel Hobby** | 100 GB bandwidth/month (more than enough for SIH demo). |
| **OSRM Public** | Rate limits may apply under heavy use. |
| **Nominatim** | 1 request/second fair use. NEXORA uses debounced search. |
| **SMS** | Simulation only (no real SMS without a paid provider). |
| **Satellite** | Simulation only. |
| **Google Maps** | Optional. MapLibre/Leaflet used by default at ₹0 cost. |

---

## Local Development (unchanged)

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate       # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Local dev uses SQLite and local uploads automatically — no Supabase connection required.

---

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` is **backend-only** — never set it in Vercel VITE_ env vars
- `NER_SECRET_KEY` (JWT signing) must be a strong random string — not `secret123`
- `.env` files are in `.gitignore` — never commit real credentials
- Production errors return safe messages — no stack traces or credentials exposed
- Private Supabase Storage bucket + backend-generated signed URLs protect citizen evidence
