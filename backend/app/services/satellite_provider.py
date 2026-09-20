"""
NEXORA Satellite Communication Provider
========================================
Future-ready satellite adapter. ALWAYS returns NOT_CONFIGURED unless a
real native/provider SDK session is explicitly injected.

IMPORTANT DESIGN RULES:
- GPS signal availability does NOT imply satellite internet connectivity.
- Emergency SOS (iPhone, Android) is NOT general satellite data service.
- A web/PWA app cannot detect or create satellite radio links.
- This module will only show ACTIVE if a real SDK session is registered.
- Do NOT change the default state to ACTIVE/AVAILABLE without real integration.

Possible states:
    UNKNOWN                 — Cannot determine capability
    NOT_CONFIGURED          — No satellite provider registered (default)
    NOT_SUPPORTED           — Device/platform confirmed without satellite support
    SUPPORTED_BUT_UNAVAILABLE — SDK present but no active session
    AVAILABLE               — Session active, not yet transmitting
    ACTIVE                  — Session active and transmitting data

Supported future integrations (when SDK available):
    - Starlink Direct-to-Device
    - OneWeb / Eutelsat
    - AST SpaceMobile
    - Inmarsat BGAN
    - ISRO GSAT / SatCom (native Android bridge)
"""

from enum import Enum
from typing import Optional
import json
import datetime


class SatelliteState(str, Enum):
    UNKNOWN = "UNKNOWN"
    NOT_CONFIGURED = "NOT_CONFIGURED"
    NOT_SUPPORTED = "NOT_SUPPORTED"
    SUPPORTED_BUT_UNAVAILABLE = "SUPPORTED_BUT_UNAVAILABLE"
    AVAILABLE = "AVAILABLE"
    ACTIVE = "ACTIVE"


class SatelliteCommunicationProvider:
    """
    Satellite communication adapter.
    Default state is NOT_CONFIGURED.
    State only changes to AVAILABLE/ACTIVE when a real provider SDK
    explicitly injects a confirmed session via register_session().
    """

    def __init__(self):
        self._state = SatelliteState.NOT_CONFIGURED
        self._provider_name: Optional[str] = None
        self._session_token: Optional[str] = None
        self._capability_confirmed: bool = False
        self._registered_at: Optional[datetime.datetime] = None

    @property
    def state(self) -> SatelliteState:
        return self._state

    @property
    def provider_name(self) -> Optional[str]:
        return self._provider_name

    def register_session(
        self,
        provider_name: str,
        session_token: str,
        capability_confirmed: bool = False,
    ) -> None:
        """
        Register a real satellite provider session.
        Only call this when an actual satellite SDK confirms capability.
        Do NOT call this based on GPS availability or Emergency SOS presence.

        Args:
            provider_name: Name of the satellite provider (e.g. "Starlink D2D")
            session_token: Session token from provider SDK
            capability_confirmed: True ONLY if SDK explicitly confirms data capability
        """
        self._provider_name = provider_name
        self._session_token = session_token
        self._capability_confirmed = capability_confirmed
        self._registered_at = datetime.datetime.utcnow()

        if capability_confirmed:
            self._state = SatelliteState.AVAILABLE
            print(f"[SATELLITE] Provider '{provider_name}' registered — state: AVAILABLE")
        else:
            self._state = SatelliteState.SUPPORTED_BUT_UNAVAILABLE
            print(f"[SATELLITE] Provider '{provider_name}' registered — capability not confirmed — state: SUPPORTED_BUT_UNAVAILABLE")

    def mark_active(self) -> None:
        """
        Mark session as actively transmitting data.
        Should only be called when the provider SDK confirms active data link.
        """
        if self._state == SatelliteState.AVAILABLE:
            self._state = SatelliteState.ACTIVE
            print(f"[SATELLITE] Session ACTIVE — provider: {self._provider_name}")
        else:
            print(f"[SATELLITE] mark_active() called but state is {self._state} — ignoring.")

    def deactivate(self) -> None:
        """Deactivate current session."""
        self._state = SatelliteState.NOT_CONFIGURED
        self._provider_name = None
        self._session_token = None
        self._capability_confirmed = False
        print("[SATELLITE] Session deactivated — state: NOT_CONFIGURED")

    def can_transmit(self) -> bool:
        """Returns True only if satellite data transmission is genuinely available."""
        return self._state == SatelliteState.ACTIVE

    def send_compact_hazard(self, hazard: dict) -> dict:
        """
        Send a compact hazard message over satellite link.
        Only executes if state == ACTIVE.

        Message format is minimal to fit constrained satellite bandwidth.
        Does NOT send: full SACHET XML, images, map tiles.
        """
        if not self.can_transmit():
            return {
                "sent": False,
                "reason": f"Satellite not active. Current state: {self._state.value}",
                "state": self._state.value,
            }

        # Compact hazard message — minimal fields for constrained channel
        message = {
            "type": "ROUTE_HAZARD",
            "hazard_id": hazard.get("id"),
            "event": hazard.get("event_type", "UNKNOWN"),
            "severity": hazard.get("severity", "UNKNOWN"),
            "lat": hazard.get("latitude"),
            "lon": hazard.get("longitude"),
            "radius_km": hazard.get("radius_km", 5.0),
            "issued_at": hazard.get("issued_at") or datetime.datetime.utcnow().isoformat(),
        }

        # Validate required fields
        if not message["hazard_id"] or not message["lat"] or not message["lon"]:
            return {
                "sent": False,
                "reason": "Hazard missing required fields (id, lat, lon)",
                "state": self._state.value,
            }

        payload_json = json.dumps(message, separators=(",", ":"))
        payload_bytes = len(payload_json.encode("utf-8"))

        # In a real integration, this would call the provider SDK
        # For now, log the would-be transmission
        print(f"[SATELLITE] Would transmit {payload_bytes}B: {payload_json}")

        return {
            "sent": True,
            "provider": self._provider_name,
            "payload_bytes": payload_bytes,
            "message": message,
            "state": self._state.value,
        }

    def get_status(self) -> dict:
        """Public status summary for /api/communication/status endpoint."""
        return {
            "state": self._state.value,
            "provider": self._provider_name,
            "capability_confirmed": self._capability_confirmed,
            "can_transmit": self.can_transmit(),
            "description": _state_description(self._state),
            "important_note": (
                "GPS signal availability does NOT imply satellite internet connectivity. "
                "Emergency SOS is NOT general satellite data service. "
                "Satellite state is ACTIVE only with confirmed real SDK integration."
            ),
        }


def _state_description(state: SatelliteState) -> str:
    return {
        SatelliteState.NOT_CONFIGURED: (
            "No satellite provider configured. To enable, register a real satellite SDK session."
        ),
        SatelliteState.UNKNOWN: (
            "Satellite capability unknown. Cannot determine without provider SDK."
        ),
        SatelliteState.NOT_SUPPORTED: (
            "Device/platform confirmed as not supporting satellite data connectivity."
        ),
        SatelliteState.SUPPORTED_BUT_UNAVAILABLE: (
            "Satellite provider registered but no active session confirmed."
        ),
        SatelliteState.AVAILABLE: (
            "Satellite session available. Not yet actively transmitting."
        ),
        SatelliteState.ACTIVE: (
            "Satellite session active and transmitting data."
        ),
    }.get(state, "Unknown satellite state.")


# Module-level singleton — shared across the application lifetime
_satellite_provider = SatelliteCommunicationProvider()


def get_satellite_provider() -> SatelliteCommunicationProvider:
    """Return the global satellite provider singleton."""
    return _satellite_provider


def get_satellite_status() -> dict:
    """Public status summary for /api/communication/status endpoint."""
    return _satellite_provider.get_status()
