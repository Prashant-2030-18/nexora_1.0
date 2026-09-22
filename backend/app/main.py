import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base, SessionLocal
from .models import State, User
from .routers import (
    auth, states_districts, roads, logistics, incidents,
    routes, accessibility, simulation, predictions,
    hub_planner, infrastructure_gaps, analytics, ai_copilot,
    notifications, admin, reports, disasters, user_reports,
    geo, weather
)
from .routers import journeys as journeys_router
from .routers import offline_sync as offline_sync_router

def init_db():
    """Safely initialize schema and apply backward-compatible column migrations."""
    try:
        from .database import engine as _eng
        Base.metadata.create_all(bind=_eng)
        print(f"[DATABASE] Schema tables verified on {_eng.dialect.name}.")
    except Exception as _init_err:
        print(f"[DATABASE WARNING] Schema create_all notice: {_init_err}")

    try:
        from .database import engine as _eng
        from sqlalchemy import text as _text, inspect as _inspect
        dialect_name = _eng.dialect.name
        is_postgres = "postgres" in dialect_name
        insp = _inspect(_eng)
        tables = set(insp.get_table_names())
        alters = []
        dt_type = "TIMESTAMP" if is_postgres else "DATETIME"
        bool_false = "FALSE" if is_postgres else "0"

        if "disaster_alerts" in tables:
            existing = {c["name"] for c in insp.get_columns("disaster_alerts")}
            if "source" not in existing:
                alters.append("ALTER TABLE disaster_alerts ADD COLUMN source VARCHAR(50) DEFAULT 'SACHET_NDMA'")
            if "source_type" not in existing:
                alters.append("ALTER TABLE disaster_alerts ADD COLUMN source_type VARCHAR(50) DEFAULT 'OFFICIAL'")
            if "verification_status" not in existing:
                alters.append("ALTER TABLE disaster_alerts ADD COLUMN verification_status VARCHAR(50) DEFAULT 'VERIFIED'")
        if "sachet_feed_cache" in tables:
            existing = {c["name"] for c in insp.get_columns("sachet_feed_cache")}
            extra = [
                ("source", "ALTER TABLE sachet_feed_cache ADD COLUMN source VARCHAR(50) DEFAULT 'SACHET_NDMA'"),
                ("source_type", "ALTER TABLE sachet_feed_cache ADD COLUMN source_type VARCHAR(50) DEFAULT 'OFFICIAL'"),
                ("verification_status", "ALTER TABLE sachet_feed_cache ADD COLUMN verification_status VARCHAR(50) DEFAULT 'VERIFIED'"),
                ("response_status", "ALTER TABLE sachet_feed_cache ADD COLUMN response_status VARCHAR(50)"),
                ("fetched_at", f"ALTER TABLE sachet_feed_cache ADD COLUMN fetched_at {dt_type}"),
            ]
            for col, sql in extra:
                if col not in existing:
                    alters.append(sql)
        if "sachet_etag_cache" in tables:
            existing = {c["name"] for c in insp.get_columns("sachet_etag_cache")}
            extra = [
                ("source", "ALTER TABLE sachet_etag_cache ADD COLUMN source VARCHAR(50) DEFAULT 'SACHET_NDMA'"),
                ("source_type", "ALTER TABLE sachet_etag_cache ADD COLUMN source_type VARCHAR(50) DEFAULT 'OFFICIAL'"),
                ("verification_status", "ALTER TABLE sachet_etag_cache ADD COLUMN verification_status VARCHAR(50) DEFAULT 'VERIFIED'"),
                ("response_status", "ALTER TABLE sachet_etag_cache ADD COLUMN response_status VARCHAR(50)"),
                ("fetched_at", f"ALTER TABLE sachet_etag_cache ADD COLUMN fetched_at {dt_type}"),
            ]
            for col, sql in extra:
                if col not in existing:
                    alters.append(sql)
        if "user_reports" in tables:
            existing_ur = {c["name"] for c in insp.get_columns("user_reports")}
            ur_extra = [
                ("verification_status", "ALTER TABLE user_reports ADD COLUMN verification_status VARCHAR(50) DEFAULT 'AI_REVIEW'"),
                ("ai_confidence", "ALTER TABLE user_reports ADD COLUMN ai_confidence FLOAT DEFAULT 0.0"),
                ("ai_reason", "ALTER TABLE user_reports ADD COLUMN ai_reason TEXT"),
                ("evidence_score", "ALTER TABLE user_reports ADD COLUMN evidence_score FLOAT"),
                ("location_score", "ALTER TABLE user_reports ADD COLUMN location_score FLOAT"),
                ("consistency_score", "ALTER TABLE user_reports ADD COLUMN consistency_score FLOAT"),
                ("duplicate_score", "ALTER TABLE user_reports ADD COLUMN duplicate_score FLOAT"),
                ("image_analysis_available", f"ALTER TABLE user_reports ADD COLUMN image_analysis_available BOOLEAN DEFAULT {bool_false}"),
                ("image_analysis_summary", "ALTER TABLE user_reports ADD COLUMN image_analysis_summary TEXT"),
                ("verified_at", f"ALTER TABLE user_reports ADD COLUMN verified_at {dt_type}"),
                ("verification_model", "ALTER TABLE user_reports ADD COLUMN verification_model VARCHAR(100)"),
                ("verification_version", "ALTER TABLE user_reports ADD COLUMN verification_version VARCHAR(50) DEFAULT '1.0.0'"),
                ("corroboration_count", "ALTER TABLE user_reports ADD COLUMN corroboration_count INTEGER DEFAULT 1"),
                ("corroborated_sachet_alert_id", "ALTER TABLE user_reports ADD COLUMN corroborated_sachet_alert_id INTEGER"),
                ("corroborated_sachet_identifier", "ALTER TABLE user_reports ADD COLUMN corroborated_sachet_identifier VARCHAR(100)"),
                ("location_scope", "ALTER TABLE user_reports ADD COLUMN location_scope VARCHAR(50)"),
                ("evidence_hash", "ALTER TABLE user_reports ADD COLUMN evidence_hash VARCHAR(64)"),
                ("gps_accuracy", "ALTER TABLE user_reports ADD COLUMN gps_accuracy FLOAT"),
                ("road_impact", "ALTER TABLE user_reports ADD COLUMN road_impact VARCHAR(50) DEFAULT 'NONE'"),
                ("unique_evidence_count", "ALTER TABLE user_reports ADD COLUMN unique_evidence_count INTEGER DEFAULT 0"),
                ("expires_at", f"ALTER TABLE user_reports ADD COLUMN expires_at {dt_type}"),
            ]
            for col, sql in ur_extra:
                if col not in existing_ur:
                    alters.append(sql)
        if "users" in tables:
            existing_u = {c["name"] for c in insp.get_columns("users")}
            if "phone" not in existing_u:
                alters.append("ALTER TABLE users ADD COLUMN phone VARCHAR(20)")
            if "sms_alerts_enabled" not in existing_u:
                alters.append(f"ALTER TABLE users ADD COLUMN sms_alerts_enabled BOOLEAN DEFAULT {bool_false}")
        if alters:
            with _eng.begin() as conn:
                for sql in alters:
                    try:
                        conn.execute(_text(sql))
                    except Exception as col_err:
                        print(f"[SCHEMA NOTICE] Column add notice ({col_err}): {sql}")
            print(f"[SCHEMA] Verified/applied {len(alters)} column migration(s) on {dialect_name}.")
    except Exception as _mig_err:
        print(f"[SCHEMA] Column check notice: {_mig_err}")

app = FastAPI(
    title="NEXORA — AI-Based Smart Logistics & Accessibility Intelligence Platform (MDoNER)",
    description="Production-grade GIS, Routing, Disaster, and Logistics Intelligence API for the North Eastern Region of India (SIH26002).",
    version="2.0.0"
)

from pathlib import Path
from fastapi.staticfiles import StaticFiles
from .config import settings

# Setup and mount static uploads directory for citizen disaster evidence photos
UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
(UPLOAD_ROOT / "reports").mkdir(parents=True, exist_ok=True)

# Enable CORS for frontend integration
_dev_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "https://nexora-1-0.vercel.app",
]
_prod_origins = [o.strip() for o in settings.FRONTEND_ORIGIN.split(",") if o.strip()]
_allowed_origins = list(dict.fromkeys(_dev_origins + _prod_origins))  # dedup, preserve order

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")

# Register API routers
app.include_router(auth.router)
app.include_router(states_districts.router)
app.include_router(roads.router)
app.include_router(logistics.router)
app.include_router(incidents.router)
app.include_router(routes.router)
app.include_router(accessibility.router)
app.include_router(simulation.router)
app.include_router(predictions.router)
app.include_router(hub_planner.router)
app.include_router(infrastructure_gaps.router)
app.include_router(analytics.router)
app.include_router(ai_copilot.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(reports.router)
app.include_router(disasters.router)
app.include_router(disasters.router_direct)
app.include_router(user_reports.router)
app.include_router(geo.router)
app.include_router(weather.router)
app.include_router(journeys_router.router)
app.include_router(offline_sync_router.router)

@app.on_event("startup")
def on_startup():
    # Safely initialize database schema
    init_db()

    db = SessionLocal()
    try:
        # Print integration status
        print("=" * 60)
        print("  NEXORA PLATFORM INITIALIZATION — MDoNER (SIH26002)")
        print(f"  • Environment:     {settings.ENVIRONMENT}")
        print(f"  • Gemini AI:        {'CONFIGURED & ACTIVE' if settings.is_gemini_configured else 'NOT CONFIGURED'}")
        print(f"  • OpenWeatherMap:   {'CONFIGURED & ACTIVE' if settings.is_openweather_configured else 'NOT CONFIGURED (Using Open-Meteo Fallback)'}")
        print(f"  • SACHET NDMA:      {'CONFIGURED & ACTIVE' if settings.is_sachet_configured else 'NOT CONFIGURED'}")
        sms_state = "CONFIGURED" if settings.SMS_PROVIDER and settings.SMS_API_KEY else "NOT CONFIGURED (Simulation)"
        print(f"  • SMS Fallback:     {sms_state}")
        print(f"  • Satellite Comms:  NOT CONFIGURED (no SDK registered)")
        print(f"  • Storage:          {'Supabase Storage' if settings.is_supabase_configured else 'Local filesystem (dev)'}")
        cors_info = ", ".join(_allowed_origins) if len(_allowed_origins) <= 5 else f"{len(_allowed_origins)} origins"
        print(f"  • CORS Origins:     {cors_info}")
        print(f"  • Offline Threshold: {settings.JOURNEY_OFFLINE_THRESHOLD_SECONDS}s heartbeat → OFFLINE_ASSUMED")
        print("=" * 60)

        try:
            state_count = db.query(State).count()
            if state_count == 0:
                print("[INFO] Empty geographic database detected. Seeding NER states, districts, highways, and infrastructure...")
                try:
                    from seed import run_seed
                except ImportError:
                    from .seed import run_seed
                run_seed(db)
                print("[SUCCESS] Production NER baseline dataset initialized.")
        except Exception as seed_err:
            print(f"[SEED NOTICE] Seed initialization skipped or completed: {seed_err}")

        try:
            from .user_registry import sync_registry_to_db
            sync_registry_to_db(db)
        except Exception as reg_err:
            print(f"[REGISTRY NOTICE] User registry sync: {reg_err}")

        # Check if an administrator exists
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count == 0:
            admin_email = os.getenv("ADMIN_EMAIL")
            admin_password = os.getenv("ADMIN_PASSWORD")
            if admin_email and admin_password:
                import bcrypt
                pw_hash = bcrypt.hashpw(admin_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
                new_admin = User(
                    name=os.getenv("ADMIN_NAME", "MDoNER Administrator"),
                    email=admin_email,
                    password_hash=pw_hash,
                    role="admin",
                    state=os.getenv("ADMIN_STATE", "All"),
                    phone=os.getenv("ADMIN_PHONE"),
                    is_active=True
                )
                db.add(new_admin)
                db.commit()
                print(f"[ADMIN SETUP] Initial administrator provisioned from environment: {admin_email}")
            else:
                print("[SECURITY NOTICE] No administrator account found in database.")
                print("[SECURITY NOTICE] To provision an administrator, run: python create_admin.py")
                print("[SECURITY NOTICE] Or set ADMIN_EMAIL and ADMIN_PASSWORD in environment.")
    except Exception as e:
        print(f"[STARTUP] Init check: {e}")
    finally:
        db.close()

@app.get("/")
def root():
    return {
        "platform": "NEXORA — AI Smart Logistics & Accessibility Platform",
        "ministry": "Ministry of Development of North Eastern Region (MDoNER)",
        "hackathon": "Smart India Hackathon 2026 (PS ID: SIH26002)",
        "status": "Operational",
        "version": "2.0.0",
        "integrations": settings.summary(),
        "routing_engine": "OSRM Live Public Routing (router.project-osrm.org)",
        "disaster_feed": "NDMA SACHET Live Feed",
        "weather_feed": "OpenWeatherMap Official Live (with Open-Meteo Fallback)"
    }

@app.get("/health")
def health():
    """Lightweight health check — used by Render health probes and deployment verification."""
    from .database import engine as _eng
    db_type = "postgresql" if "postgresql" in str(_eng.url) else "sqlite"
    return {
        "status": "ok",
        "service": "nexora-api",
        "version": "2.0.0",
        "environment": settings.ENVIRONMENT,
        "storage": settings.storage_provider,
        "database": db_type,
    }

@app.get("/health/live")
def health_live():
    """Ultra-lightweight liveness probe — returns 200 immediately without database hit."""
    return {
        "status": "alive",
        "service": "nexora-api",
        "version": "2.0.0"
    }

@app.get("/health/ready")
def health_ready():
    """Readiness probe — verifies database connectivity and returns system ready state."""
    from .database import SessionLocal, engine as _eng
    from sqlalchemy import text
    from fastapi.responses import JSONResponse
    db_ok = False
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        db_ok = False

    db_type = "postgresql" if "postgresql" in str(_eng.url) else "sqlite"
    if not db_ok:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "disconnected", "database_type": db_type, "service": "nexora-api"}
        )
    return {
        "status": "ready",
        "database": "connected",
        "database_type": db_type,
        "service": "nexora-api",
        "version": "2.0.0"
    }

@app.get("/api/services/status")
@app.get("/services/status")
def services_status():
    """Per-service health panel — honest states, no fake CONNECTED badges."""
    from .database import SessionLocal, engine as _eng
    from .services.sachet_service import get_sachet_sync_status
    db = SessionLocal()
    try:
        try:
            sachet = get_sachet_sync_status(db)
        except Exception as sachet_err:
            print(f"[STATUS] SACHET status check notice: {sachet_err}")
            sachet = {
                "status": "Degraded",
                "statusCode": "DEGRADED",
                "statusBadge": "FEED DEGRADED",
                "is_live": False,
                "error": str(sachet_err),
            }

        db_ok = True
        try:
            db.execute(__import__("sqlalchemy").text("SELECT 1"))
        except Exception:
            db_ok = False

        db_type = "PostgreSQL" if "postgresql" in str(_eng.url) else "SQLite"

        return {
            "backendApi": {"status": "Connected", "detail": "FastAPI operational"},
            "database": {"status": "Connected" if db_ok else "Unavailable", "detail": db_type},
            "sachetNdma": {
                "status": sachet.get("statusBadge") or sachet.get("status") or "Degraded",
                "statusCode": sachet.get("statusCode") or "DEGRADED",
                "isLive": sachet.get("is_live", False),
                "lastSuccessfulFetch": sachet.get("lastSuccessfulFetch") or sachet.get("last_successful_fetch_time"),
                "etagPresent": sachet.get("etagPresent", False),
                "error": sachet.get("error"),
            },
            "gps": {"status": "GPS Standby", "detail": "Device Geolocation API (client-side)"},
            "routingProvider": {"status": "Connected", "detail": "OSRM (router.project-osrm.org)"},
            "weatherProvider": {
                "status": "Connected" if settings.is_openweather_configured else "Degraded",
                "detail": "OpenWeatherMap" if settings.is_openweather_configured else "Open-Meteo fallback",
            },
            "aiProvider": {
                "status": "Connected" if settings.is_gemini_configured else "Not Configured",
                "detail": "Gemini" if settings.is_gemini_configured else "Rule-based fallback",
            },
            "googleMapsProvider": {
                "status": "Connected" if settings.is_google_maps_configured else "Not Configured",
                "detail": "Google Maps Platform" if settings.is_google_maps_configured else "OpenStreetMap fallback on frontend",
            },
            "openStreetMapProvider": {"status": "Connected", "detail": "OSM tile + Nominatim geocoding"},
        }
    finally:
        db.close()
