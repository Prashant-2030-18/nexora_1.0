"""
NEXORA SMS Provider Service
===========================
Factory-pattern SMS provider. NEVER claims DELIVERED unless real provider confirms.

Configuration via environment variables:
    SMS_PROVIDER=         # empty = ConsoleSmsProvider (simulation)
    SMS_API_KEY=          # real provider API key
    SMS_SENDER_ID=NEXORA  # sender name/number
    SMS_API_URL=          # real provider endpoint

DO NOT expose SMS_API_KEY to frontend. All calls are server-side only.
"""
import os
import json
import datetime
from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional, Dict

from ..config import settings


# ── SMS Provider State ────────────────────────────────────────────────────────

class SmsProviderState(str, Enum):
    LIVE = "LIVE"                      # Real provider, keys configured
    SIMULATION = "SIMULATION"          # ConsoleSmsProvider — development only
    NOT_CONFIGURED = "NOT_CONFIGURED"  # No provider configured
    ERROR = "ERROR"                    # Provider configured but failing


# ── Language Fallback Chain ───────────────────────────────────────────────────

SUPPORTED_LANGUAGES = {
    "en", "hi", "as", "bn", "brx", "kha", "grt",
    "lus", "mni", "nag", "ne", "kok"
}

LANGUAGE_FALLBACK = {
    # Preferred → Hindi → English
    "as": "hi", "bn": "hi", "brx": "hi", "kha": "en",
    "grt": "en", "lus": "en", "mni": "hi", "nag": "en",
    "ne": "hi", "kok": "hi",
}

def resolve_language(preferred: str) -> str:
    """Resolve language with fallback chain: preferred → Hindi → English."""
    lang = (preferred or "en").lower()
    if lang in SUPPORTED_LANGUAGES:
        return lang
    fallback = LANGUAGE_FALLBACK.get(lang, "en")
    return fallback


# ── SMS Templates ─────────────────────────────────────────────────────────────

SMS_TEMPLATES: Dict[str, Dict[str, str]] = {
    "route_hazard_alert": {
        "en": (
            "NEXORA ROUTE ALERT: {severity} {event_type} reported on your planned "
            "corridor near {landmark}. Avoid the affected route. "
            "Last known route position: {last_position_desc}. "
            "Open NEXORA when data connectivity returns."
        ),
        "hi": (
            "NEXORA मार्ग चेतावनी: आपके नियोजित गलियारे पर {landmark} के पास "
            "{severity} {event_type} की सूचना है। प्रभावित मार्ग से बचें। "
            "अंतिम ज्ञात स्थिति: {last_position_desc}। "
            "डेटा कनेक्टिविटी लौटने पर NEXORA खोलें।"
        ),
    },
    "route_hazard_critical": {
        "en": (
            "NEXORA CRITICAL ALERT: {event_type} on your route near {landmark}. "
            "Stop if safe. Last known position: {last_position_desc}. "
            "Emergency services: 112."
        ),
        "hi": (
            "NEXORA गंभीर चेतावनी: {landmark} के पास आपके मार्ग पर {event_type}। "
            "सुरक्षित हो तो रुकें। अंतिम ज्ञात स्थिति: {last_position_desc}। "
            "आपातकालीन सेवाएं: 112।"
        ),
    },
}

def render_sms(template_key: str, language: str, variables: dict) -> str:
    """Render an SMS template in the given language with variable substitution."""
    lang = resolve_language(language)
    templates = SMS_TEMPLATES.get(template_key, {})
    text = templates.get(lang) or templates.get("en", "NEXORA Route Alert. Open the app when connectivity returns.")
    try:
        return text.format(**variables)
    except KeyError:
        return text


# ── Abstract Base ─────────────────────────────────────────────────────────────

class SmsProviderBase(ABC):
    """Abstract SMS provider interface."""

    @abstractmethod
    def send_message(
        self,
        phone_number: str,
        template_key: str,
        language: str,
        variables: dict,
    ) -> dict:
        """
        Send an SMS. Returns a result dict:
        {
            "status": SmsProviderState,
            "provider": str,
            "message_id": str | None,
            "error": str | None,
            "simulated": bool,
        }
        NEVER claims DELIVERED unless provider explicitly confirms.
        """
        ...

    @abstractmethod
    def get_state(self) -> SmsProviderState:
        """Return current provider state."""
        ...


# ── Console / Simulation Provider ────────────────────────────────────────────

class ConsoleSmsProvider(SmsProviderBase):
    """
    Development-only SMS provider.
    Prints simulated SMS to stdout with a [SIMULATED SMS] label.
    NEVER claims DELIVERED — always returns SIMULATION state.
    This provider must never be used in production to mask real failures.
    """

    PROVIDER_NAME = "ConsoleSmsProvider (DEVELOPMENT SIMULATION)"

    def get_state(self) -> SmsProviderState:
        return SmsProviderState.SIMULATION

    def send_message(
        self,
        phone_number: str,
        template_key: str,
        language: str,
        variables: dict,
    ) -> dict:
        # Mask phone number in output
        masked = self._mask_phone(phone_number)
        body = render_sms(template_key, language, variables)

        timestamp = datetime.datetime.utcnow().isoformat()
        print("=" * 60)
        print(f"  [SIMULATED SMS] — {timestamp}")
        print(f"  ⚠️  DEVELOPMENT SIMULATION — NOT DELIVERED TO REAL DEVICE")
        print(f"  To:       {masked}")
        print(f"  Template: {template_key}")
        print(f"  Language: {language}")
        print(f"  Body:     {body}")
        print("=" * 60)

        return {
            "status": SmsProviderState.SIMULATION,
            "provider": self.PROVIDER_NAME,
            "message_id": None,
            "error": None,
            "simulated": True,
            "body": body,
            "to": masked,
        }

    @staticmethod
    def _mask_phone(phone: str) -> str:
        """Mask middle digits: +91 ******3210"""
        if not phone:
            return "UNKNOWN"
        p = phone.strip()
        if len(p) > 6:
            prefix = p[:3]
            suffix = p[-4:]
            return f"{prefix} ******{suffix}"
        return "******"


# ── Not-Configured Stub ───────────────────────────────────────────────────────

class NotConfiguredSmsProvider(SmsProviderBase):
    """Returned when no provider is configured. Never sends anything."""

    def get_state(self) -> SmsProviderState:
        return SmsProviderState.NOT_CONFIGURED

    def send_message(self, phone_number, template_key, language, variables) -> dict:
        return {
            "status": SmsProviderState.NOT_CONFIGURED,
            "provider": "NotConfiguredSmsProvider",
            "message_id": None,
            "error": "SMS_PROVIDER environment variable is not set. Set SMS_PROVIDER, SMS_API_KEY, and SMS_SENDER_ID to enable.",
            "simulated": False,
        }


# ── Factory ───────────────────────────────────────────────────────────────────

class SmsProviderFactory:
    """
    Returns the appropriate SMS provider based on environment config.

    Priority:
    1. If SMS_PROVIDER env var is set → attempt to load real provider
    2. If in development (ENVIRONMENT != production) → ConsoleSmsProvider
    3. Otherwise → NotConfiguredSmsProvider

    SMS_API_KEY and credentials are NEVER exposed to frontend.
    """

    _instance: Optional[SmsProviderBase] = None

    @classmethod
    def get(cls) -> SmsProviderBase:
        if cls._instance is not None:
            return cls._instance

        provider_name = settings.SMS_PROVIDER
        api_key = settings.SMS_API_KEY

        if provider_name and api_key:
            # Future: load real provider by name
            # e.g. TwilioSmsProvider, AwsSnsProvider
            # For now, log that it's configured but not implemented
            print(f"[SMS] Provider '{provider_name}' configured but no adapter implemented yet.")
            print(f"[SMS] Falling back to ConsoleSmsProvider until adapter is registered.")
            cls._instance = ConsoleSmsProvider()
        else:
            # Default: simulation in development, not-configured otherwise
            if settings.ENVIRONMENT != "production":
                print(f"[SMS] No SMS_PROVIDER configured — using ConsoleSmsProvider (SIMULATION).")
                cls._instance = ConsoleSmsProvider()
            else:
                print(f"[SMS] No SMS_PROVIDER configured in production — SMS fallback DISABLED.")
                cls._instance = NotConfiguredSmsProvider()

        return cls._instance

    @classmethod
    def reset(cls):
        """Reset singleton — used in tests."""
        cls._instance = None


def get_sms_provider_status() -> dict:
    """Public status summary for /api/communication/status endpoint."""
    provider = SmsProviderFactory.get()
    state = provider.get_state()
    return {
        "state": state.value,
        "provider": type(provider).__name__,
        "configured": state == SmsProviderState.LIVE,
        "simulated": state == SmsProviderState.SIMULATION,
        "description": (
            "Development simulation only — messages are NOT delivered to real devices."
            if state == SmsProviderState.SIMULATION
            else "No SMS provider configured. Set SMS_PROVIDER, SMS_API_KEY in environment."
            if state == SmsProviderState.NOT_CONFIGURED
            else "Live SMS provider active."
        ),
        "min_severity": settings.SMS_HAZARD_MIN_SEVERITY,
        "sender_id": settings.SMS_SENDER_ID if settings.SMS_SENDER_ID else None,
    }
