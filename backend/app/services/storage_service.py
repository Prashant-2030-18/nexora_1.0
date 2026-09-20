"""
Evidence Storage Abstraction — NEXORA SIH26002
===============================================
Two providers:
  LocalEvidenceStorage  — saves to local ./uploads/reports/ directory (development)
  SupabaseEvidenceStorage — uploads to Supabase Storage bucket (production)

Selected at runtime via the SUPABASE_URL environment variable:
  - present  → SupabaseEvidenceStorage
  - absent   → LocalEvidenceStorage

Supabase uploads use the REST API via httpx (no extra SDK required).
"""

import os
import hashlib
import uuid
import logging
from pathlib import Path
from typing import Tuple
import httpx

logger = logging.getLogger(__name__)

# ── configuration from environment ──────────────────────────────────────────
_SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
_SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
_SUPABASE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "citizen-evidence")

# Signed-URL expiry for viewing private evidence (24 hours)
_SIGNED_URL_EXPIRY_SECONDS = int(os.getenv("SUPABASE_SIGNED_URL_EXPIRY", str(24 * 3600)))


# ── local storage ────────────────────────────────────────────────────────────

def _local_upload_dir() -> Path:
    """Locate the uploads/reports directory relative to the backend root."""
    backend_root = Path(__file__).resolve().parent.parent.parent
    # Prefer the shared uploads folder at the project root (mounted via StaticFiles)
    upload_dir = backend_root.parent / "uploads" / "reports"
    if not upload_dir.exists():
        upload_dir = backend_root / "uploads" / "reports"
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


class LocalEvidenceStorage:
    """Stores citizen evidence on the local filesystem (development only)."""

    def upload(self, content: bytes, filename: str, mime_type: str) -> Tuple[str, str]:
        """
        Save file locally.
        Returns (evidence_url, object_path).
        evidence_url is a relative URL served by FastAPI StaticFiles.
        """
        upload_dir = _local_upload_dir()
        ext = Path(filename).suffix.lower()
        safe_name = f"{uuid.uuid4().hex}{ext}"
        dest = upload_dir / safe_name
        dest.write_bytes(content)
        relative_url = f"/uploads/reports/{safe_name}"
        logger.info("[LocalEvidenceStorage] Saved %s → %s", safe_name, relative_url)
        return relative_url, f"reports/{safe_name}"

    def get_signed_url(self, object_path: str, expiry_seconds: int = _SIGNED_URL_EXPIRY_SECONDS) -> str:
        """Return the local static URL (no signing needed for local dev)."""
        # object_path is like "reports/<uuid>.jpg"
        return f"/uploads/{object_path}"


class SupabaseEvidenceStorage:
    """
    Uploads citizen evidence to Supabase Storage bucket via the REST API.
    Uses service-role key on the backend — never exposed to the frontend.
    """

    def __init__(self):
        self.url = _SUPABASE_URL
        self.key = _SUPABASE_SERVICE_ROLE_KEY
        self.bucket = _SUPABASE_BUCKET
        self._headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
        }

    def _storage_url(self, object_path: str) -> str:
        return f"{self.url}/storage/v1/object/{self.bucket}/{object_path}"

    def _signed_url_endpoint(self, object_path: str) -> str:
        return f"{self.url}/storage/v1/object/sign/{self.bucket}/{object_path}"

    def upload(self, content: bytes, filename: str, mime_type: str) -> Tuple[str, str]:
        """
        Upload file to Supabase Storage.
        Returns (evidence_url, object_path).
        evidence_url is the object_path (use get_signed_url() to get a viewable URL).
        """
        ext = Path(filename).suffix.lower()
        object_path = f"reports/{uuid.uuid4().hex}{ext}"
        upload_url = self._storage_url(object_path)

        headers = {**self._headers, "Content-Type": mime_type, "x-upsert": "false"}
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(upload_url, content=content, headers=headers)
            if resp.status_code not in (200, 201):
                raise RuntimeError(
                    f"Supabase Storage upload failed: HTTP {resp.status_code} — {resp.text[:300]}"
                )

        logger.info("[SupabaseEvidenceStorage] Uploaded %s to bucket '%s'", object_path, self.bucket)
        return object_path, object_path

    def get_signed_url(self, object_path: str, expiry_seconds: int = _SIGNED_URL_EXPIRY_SECONDS) -> str:
        """
        Generate a signed URL for a private Supabase Storage object.
        Valid for expiry_seconds (default 24 hours).
        """
        endpoint = self._signed_url_endpoint(object_path)
        headers = {**self._headers, "Content-Type": "application/json"}
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                endpoint,
                json={"expiresIn": expiry_seconds},
                headers=headers,
            )
            if resp.status_code not in (200, 201):
                logger.warning(
                    "[SupabaseEvidenceStorage] Signed URL failed for %s: HTTP %s",
                    object_path, resp.status_code
                )
                return ""
            data = resp.json()
            signed_path = data.get("signedURL") or data.get("signedUrl") or ""
            if signed_path and not signed_path.startswith("http"):
                signed_path = f"{self.url}/storage/v1{signed_path}"
            return signed_path


# ── factory ─────────────────────────────────────────────────────────────────

def get_evidence_storage() -> "LocalEvidenceStorage | SupabaseEvidenceStorage":
    """
    Return the correct storage provider based on environment.
    If SUPABASE_URL is set (production), use SupabaseEvidenceStorage.
    Otherwise fall back to LocalEvidenceStorage (development).
    """
    if _SUPABASE_URL and _SUPABASE_SERVICE_ROLE_KEY:
        return SupabaseEvidenceStorage()
    return LocalEvidenceStorage()


# Singleton instance (created once at import time)
evidence_storage = get_evidence_storage()
