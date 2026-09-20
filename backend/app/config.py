import os
from pathlib import Path
from dotenv import load_dotenv

# Locate and load .env file from backend or root directory
env_path = Path(__file__).resolve().parent.parent / ".env"
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)
else:
    load_dotenv(override=True)

class Settings:
    NER_SECRET_KEY: str = os.getenv("NER_SECRET_KEY", "sih-mdoner-ner-smartlogix-super-secure-key-2026")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENWEATHER_API_KEY: str = os.getenv("OPENWEATHER_API_KEY", "")
    GOOGLE_MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "")
    ROUTING_CAR_URL: str = os.getenv("ROUTING_CAR_URL", os.getenv("OSRM_CAR_URL", os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")))
    ROUTING_TRUCK_URL: str = os.getenv("ROUTING_TRUCK_URL", os.getenv("OSRM_CAR_URL", os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")))
    ROUTING_WALK_URL: str = os.getenv("ROUTING_WALK_URL", os.getenv("OSRM_FOOT_URL", "https://routing.openstreetmap.de/routed-foot"))
    ROUTING_BICYCLE_URL: str = os.getenv("ROUTING_BICYCLE_URL", os.getenv("OSRM_BICYCLE_URL", "https://routing.openstreetmap.de/routed-bike"))
    OSRM_BASE_URL: str = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
    OSRM_CAR_URL: str = os.getenv("OSRM_CAR_URL", ROUTING_CAR_URL)
    OSRM_FOOT_URL: str = os.getenv("OSRM_FOOT_URL", ROUTING_WALK_URL)
    OSRM_BICYCLE_URL: str = os.getenv("OSRM_BICYCLE_URL", ROUTING_BICYCLE_URL)
    SACHET_NDMA_BASE_URL: str = os.getenv(
        "SACHET_NDMA_BASE_URL",
        "https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile"
    )
    SACHET_CAP_URL: str = os.getenv(
        "SACHET_CAP_URL",
        os.getenv("SACHET_NDMA_BASE_URL", "https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile")
    )
    # Official alert listing / index (configurable; do not invent identifiers if empty)
    SACHET_LISTING_URL: str = os.getenv(
        "SACHET_LISTING_URL",
        "https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails"
    )
    SACHET_ALERT_INDEX_URL: str = os.getenv(
        "SACHET_ALERT_INDEX_URL",
        os.getenv("SACHET_LISTING_URL", "https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails")
    )
    SACHET_ALERT_IDENTIFIER: str = os.getenv("SACHET_ALERT_IDENTIFIER", "").strip()
    SACHET_REFRESH_INTERVAL_SECONDS: int = int(os.getenv("SACHET_REFRESH_INTERVAL_SECONDS", os.getenv("SACHET_POLL_INTERVAL_SEC", "300")))
    SACHET_POLL_INTERVAL_SEC: int = int(os.getenv("SACHET_POLL_INTERVAL_SEC", "300"))
    SACHET_REQUEST_TIMEOUT: float = float(os.getenv("SACHET_REQUEST_TIMEOUT", "15"))
    AI_VERIFY_HIGH_CONFIDENCE_THRESHOLD: float = float(os.getenv("AI_VERIFY_HIGH_CONFIDENCE_THRESHOLD", "0.80"))
    AI_VERIFY_MEDIUM_CONFIDENCE_THRESHOLD: float = float(os.getenv("AI_VERIFY_MEDIUM_CONFIDENCE_THRESHOLD", "0.50"))

    # Multi-Signal AI Verification Deterministic Weights
    AI_WEIGHT_IMAGE_RELEVANCE: float = float(os.getenv("AI_WEIGHT_IMAGE_RELEVANCE", "0.20"))
    AI_WEIGHT_LOCATION_CONSISTENCY: float = float(os.getenv("AI_WEIGHT_LOCATION_CONSISTENCY", "0.20"))
    AI_WEIGHT_REPORT_CONSISTENCY: float = float(os.getenv("AI_WEIGHT_REPORT_CONSISTENCY", "0.15"))
    AI_WEIGHT_SACHET_CORRELATION: float = float(os.getenv("AI_WEIGHT_SACHET_CORRELATION", "0.25"))
    AI_WEIGHT_CITIZEN_CORROBORATION: float = float(os.getenv("AI_WEIGHT_CITIZEN_CORROBORATION", "0.20"))

    # Spatial and Temporal Clustering
    CITIZEN_CLUSTERING_DISTANCE_KM: float = float(os.getenv("CITIZEN_CLUSTERING_DISTANCE_KM", "3.0"))
    CITIZEN_CLUSTERING_WINDOW_HOURS: float = float(os.getenv("CITIZEN_CLUSTERING_WINDOW_HOURS", "4.0"))
    SACHET_CORRELATION_DISTANCE_KM: float = float(os.getenv("SACHET_CORRELATION_DISTANCE_KM", "35.0"))

    # Hazard Time Decay / Freshness Lifetimes (Hours)
    HAZARD_LIFETIME_ROAD_BLOCKAGE_HOURS: int = int(os.getenv("HAZARD_LIFETIME_ROAD_BLOCKAGE_HOURS", "6"))
    HAZARD_LIFETIME_FLASH_FLOOD_HOURS: int = int(os.getenv("HAZARD_LIFETIME_FLASH_FLOOD_HOURS", "12"))
    HAZARD_LIFETIME_LANDSLIDE_HOURS: int = int(os.getenv("HAZARD_LIFETIME_LANDSLIDE_HOURS", "24"))
    HAZARD_LIFETIME_DEFAULT_HOURS: int = int(os.getenv("HAZARD_LIFETIME_DEFAULT_HOURS", "12"))

    # SMS Fallback Provider Configuration
    # SMS_PROVIDER: Leave empty for ConsoleSmsProvider (development simulation).
    # Set to a real provider name (e.g. "twilio", "aws_sns") to enable live SMS.
    SMS_PROVIDER: str = os.getenv("SMS_PROVIDER", "").strip()
    SMS_API_KEY: str = os.getenv("SMS_API_KEY", "").strip()
    SMS_SENDER_ID: str = os.getenv("SMS_SENDER_ID", "NEXORA").strip()
    SMS_API_URL: str = os.getenv("SMS_API_URL", "").strip()
    # Minimum hazard severity to trigger SMS (HIGH / CRITICAL)
    SMS_HAZARD_MIN_SEVERITY: str = os.getenv("SMS_HAZARD_MIN_SEVERITY", "HIGH").strip().upper()

    # Journey & Connectivity Monitoring
    # How long (seconds) without a heartbeat before backend marks journey as OFFLINE_ASSUMED
    JOURNEY_OFFLINE_THRESHOLD_SECONDS: int = int(os.getenv("JOURNEY_OFFLINE_THRESHOLD_SECONDS", "60"))
    # Frontend heartbeat interval (ms) — sent to frontend via /api/connectivity/health
    CONNECTIVITY_HEARTBEAT_MS: int = int(os.getenv("CONNECTIVITY_HEARTBEAT_MS", "15000"))

    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed frontend origins for production.
    # Example: "https://nexora-sih.vercel.app,https://nexora-sih-git-main.vercel.app"
    # Leave empty to allow localhost origins only (development mode).
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "")

    # ── Supabase Storage ──────────────────────────────────────────────────────
    # Set in production (Render) environment variables — never commit to Git.
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_STORAGE_BUCKET: str = os.getenv("SUPABASE_STORAGE_BUCKET", "citizen-evidence")
    SUPABASE_SIGNED_URL_EXPIRY: int = int(os.getenv("SUPABASE_SIGNED_URL_EXPIRY", str(24 * 3600)))

    @property
    def is_supabase_configured(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_SERVICE_ROLE_KEY)

    @property
    def storage_provider(self) -> str:
        return "supabase" if self.is_supabase_configured else "local"

    @property
    def is_gemini_configured(self) -> bool:
        # Accept classic Google AI Studio keys (AIza...) and newer AQ.... formats
        key = (self.GEMINI_API_KEY or "").strip()
        if len(key) < 20:
            return False
        return key.startswith("AIza") or key.startswith("AQ.") or key.startswith("AI")

    @property
    def is_openweather_configured(self) -> bool:
        return bool(self.OPENWEATHER_API_KEY and len(self.OPENWEATHER_API_KEY.strip()) > 10)

    @property
    def is_sachet_configured(self) -> bool:
        return bool(self.SACHET_CAP_URL and len(self.SACHET_CAP_URL.strip()) > 5)

    @property
    def is_sachet_index_configured(self) -> bool:
        url = self.SACHET_ALERT_INDEX_URL or self.SACHET_LISTING_URL
        return bool(url and len(url.strip()) > 8)

    @property
    def is_google_maps_configured(self) -> bool:
        return bool(self.GOOGLE_MAPS_API_KEY and len(self.GOOGLE_MAPS_API_KEY.strip()) > 10)

    def summary(self) -> dict:
        """Safe public summary without exposing secrets."""
        return {
            "environment": self.ENVIRONMENT,
            "gemini_configured": self.is_gemini_configured,
            "openweather_configured": self.is_openweather_configured,
            "sachet_configured": self.is_sachet_configured,
            "sachet_index_configured": self.is_sachet_index_configured,
            "google_maps_configured": self.is_google_maps_configured,
            "supabase_configured": self.is_supabase_configured,
            "storage_provider": self.storage_provider,
            "sachet_cap_url": self.SACHET_CAP_URL,
            "sachet_listing_url": self.SACHET_LISTING_URL,
            "sachet_alert_index_url": self.SACHET_ALERT_INDEX_URL if self.is_sachet_index_configured else "",
        }

settings = Settings()
