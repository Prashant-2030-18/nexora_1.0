import os
import httpx
import xmltodict
import json
import logging
import concurrent.futures
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from ..models import DisasterAlert, APISyncLog, DataSource, SachetEtagCache, UserReport, Incident
from ..config import settings

logger = logging.getLogger("nexora.sachet")

USER_AGENT = "NEXORA-SIH2026/1.0 (contact@nexora-ner.gov.in; emergency-logistics-ner)"
OFFICIAL_PORTAL = "https://sachet.ndma.gov.in"
DEFAULT_TIMEOUT = float(os.getenv("SACHET_REQUEST_TIMEOUT", "15"))
MAX_RETRIES = int(os.getenv("SACHET_MAX_RETRIES", "3"))
POLL_INTERVAL_SEC = int(os.getenv("SACHET_POLL_INTERVAL_SEC", "300"))


def _strip_ns(obj: Any) -> Any:
    """Strip XML namespace prefixes (e.g., 'cap:alert' -> 'alert') for unified CAP 1.2 parsing."""
    if isinstance(obj, dict):
        return {
            (k.split(":")[-1] if ":" in k and not k.startswith("@") else k): _strip_ns(v)
            for k, v in obj.items()
        }
    elif isinstance(obj, list):
        return [_strip_ns(elem) for elem in obj]
    return obj


def _parse_sachet_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse various date formats returned by SACHET NDMA CAP feeds and normalize to naive UTC."""
    if not date_str or not isinstance(date_str, str):
        return None
    cleaned = date_str.strip()
    try:
        dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        pass
    try:
        no_tz = cleaned.replace(" IST", "").replace(" UTC", "").strip()
        return datetime.strptime(no_tz, "%a %b %d %H:%M:%S %Y")
    except Exception:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%d-%m-%Y %H:%M:%S"):
        try:
            return datetime.strptime(cleaned, fmt)
        except Exception:
            continue
    return None


def _normalize_severity(sev_raw: Optional[str], color_raw: Optional[str] = None) -> str:
    """Map NDMA severity levels and color codes to standard classification."""
    s = (sev_raw or "").upper().strip()
    c = (color_raw or "").lower().strip()

    if s in ["CRITICAL", "EXTREME"] or c in ["red"]:
        return "Critical"
    if s in ["WARNING", "ALERT", "SEVERE"] or c in ["orange"]:
        return "High"
    if s in ["WATCH", "MODERATE", "ADVISORY"] or c in ["yellow"]:
        return "Medium"
    if s in ["MINOR", "LOW"]:
        return "Low"
    return "Medium"


def _as_list(val: Any) -> List[Any]:
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return [val]


def _text_or_none(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, dict):
        return val.get("#text") or val.get("value") or None
    return str(val).strip() or None


def _parse_polygon_to_geojson(polygon: str) -> Optional[str]:
    if not polygon:
        return None
    try:
        points = []
        for pair in polygon.strip().split(" "):
            parts = pair.split(",")
            if len(parts) == 2:
                points.append([float(parts[1].strip()), float(parts[0].strip())])
        if points:
            if points[0] != points[-1]:
                points.append(points[0])
            return json.dumps({"type": "Polygon", "coordinates": [points]})
    except Exception as poly_err:
        logger.warning("Polygon conversion error: %s", poly_err)
    return None


def _parse_cap_xml(xml_content: str, source_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Parse official OASIS CAP 1.2 XML into normalized DisasterAlert dictionary.
    Supports multiple info/area blocks, polygon/circle/geocode, and optional fields.
    """
    if not xml_content or not isinstance(xml_content, str):
        print("[SACHET] Empty or invalid XML content provided.")
        return None

    cleaned_text = xml_content.strip()
    lowered = cleaned_text.lower()
    if "http status 404" in lowered or ("<alert" not in lowered and ":alert" not in lowered):
        print("[SACHET] Provided content does not contain a valid <alert> root node (possible 404 response).")
        return None

    try:
        raw_dict = xmltodict.parse(cleaned_text)
    except Exception as parse_err:
        print(f"[SACHET] XML Parse Error: {parse_err}")
        return None

    cleaned = _strip_ns(raw_dict)
    alert = cleaned.get("alert")
    if not alert or not isinstance(alert, dict):
        print("[SACHET] Missing <alert> root object in parsed XML.")
        return None

    identifier = str(alert.get("identifier", "")).strip()
    if not identifier:
        print("[SACHET] CAP alert is missing mandatory 'identifier' attribute.")
        return None

    sender = alert.get("sender", "NDMA SACHET")
    status = alert.get("status", "Actual")
    msg_type = alert.get("msgType", "Alert")
    sent_str = alert.get("sent", "")
    sent_at = _parse_sachet_date(sent_str) or datetime.utcnow()

    # Optional alert-level CAP fields
    source_field = _text_or_none(alert.get("source"))
    scope = _text_or_none(alert.get("scope"))
    restriction = _text_or_none(alert.get("restriction"))
    addresses = _text_or_none(alert.get("addresses"))
    code = _text_or_none(alert.get("code"))
    note = _text_or_none(alert.get("note"))
    references = _text_or_none(alert.get("references"))

    info_blocks = _as_list(alert.get("info"))
    info = {}
    if info_blocks:
        en_info = next(
            (i for i in info_blocks if isinstance(i, dict) and str(i.get("language", "")).lower().startswith("en")),
            None,
        )
        info = en_info or (info_blocks[0] if isinstance(info_blocks[0], dict) else {})

    event = info.get("event", "Hazard Alert")
    urgency = info.get("urgency", "Expected")
    severity_raw = info.get("severity", "Moderate")
    severity = _normalize_severity(severity_raw)
    certainty = info.get("certainty", "Observed")
    category = _text_or_none(info.get("category"))
    response_type = _text_or_none(info.get("responseType"))
    headline = info.get("headline") or event
    description = info.get("description", "")
    instruction = info.get("instruction", "")
    sender_name = _text_or_none(info.get("senderName"))
    web = _text_or_none(info.get("web"))
    effective_at = _parse_sachet_date(info.get("effective", ""))
    onset_at = _parse_sachet_date(info.get("onset", ""))
    expires_at = _parse_sachet_date(info.get("expires", ""))

    # Collect all area blocks (use first with geometry preference)
    areas = _as_list(info.get("area"))
    area = areas[0] if areas and isinstance(areas[0], dict) else {}
    for candidate in areas:
        if not isinstance(candidate, dict):
            continue
        if candidate.get("polygon") or candidate.get("circle"):
            area = candidate
            break

    area_desc = area.get("areaDesc", "North Eastern Region")
    circle = area.get("circle", "") or ""
    polygon = area.get("polygon", "") or ""
    geocode = area.get("geocode")
    altitude = _text_or_none(area.get("altitude"))
    ceiling = _text_or_none(area.get("ceiling"))

    geocode_values = []
    for gc in _as_list(geocode):
        if isinstance(gc, dict):
            geocode_values.append({
                "valueName": gc.get("valueName"),
                "value": gc.get("value"),
            })
        elif gc:
            geocode_values.append({"value": str(gc)})

    polygon_geojson = _parse_polygon_to_geojson(polygon) if polygon else None

    official_source_url = (
        source_url
        or web
        or f"{OFFICIAL_PORTAL}/cap_public_website/FetchXMLFile?identifier={identifier}"
    )

    now = datetime.utcnow()
    is_active = True if not expires_at or expires_at >= now else False

    return {
        "identifier": identifier,
        "sender": sender,
        "sent_at": sent_at,
        "status": status,
        "msg_type": msg_type,
        "event": event,
        "urgency": urgency,
        "severity": severity,
        "certainty": certainty,
        "headline": headline,
        "description": description,
        "instruction": instruction,
        "area_description": area_desc,
        "polygon_geojson": polygon_geojson,
        "circle_coordinates": circle or None,
        "effective_at": effective_at,
        "onset_at": onset_at,
        "expires_at": expires_at,
        "source": "SACHET_NDMA",
        "source_type": "OFFICIAL",
        "verification_status": "VERIFIED",
        "source_url": official_source_url,
        "fetched_at": now,
        "is_active": is_active,
        # Extended CAP metadata (not all persisted — used by API serializers)
        "cap_meta": {
            "source": source_field,
            "scope": scope,
            "restriction": restriction,
            "addresses": addresses,
            "code": code,
            "note": note,
            "references": references,
            "category": category,
            "responseType": response_type,
            "senderName": sender_name,
            "web": web,
            "geocode": geocode_values,
            "altitude": altitude,
            "ceiling": ceiling,
            "areaCount": len(areas),
            "infoCount": len(info_blocks),
        },
    }


def _format_etag(etag: Optional[str]) -> Optional[str]:
    """Official If-None-Match value: quoted ETag, preserving weak validators."""
    if not etag:
        return None
    etag = str(etag).strip()
    if not etag:
        return None
    if etag.startswith("W/") or etag.startswith('"'):
        return etag
    return f'"{etag}"'


def _store_etag_value(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    value = str(raw).strip()
    if value.startswith("W/"):
        return value
    return value.strip('"')


def _request_timeout() -> httpx.Timeout:
    return httpx.Timeout(connect=5.0, read=DEFAULT_TIMEOUT, write=5.0, pool=5.0)


def _empty_meta(identifier: str = "", endpoint: str = "") -> Dict[str, Any]:
    now = datetime.utcnow()
    return {
        "source": "SACHET_NDMA",
        "sourceType": "OFFICIAL",
        "verificationStatus": "VERIFIED",
        "endpoint": endpoint,
        "alertIdentifier": identifier,
        "etag": None,
        "cachedXml": None,
        "lastCheckedAt": None,
        "lastSuccessfulFetch": None,
        "lastModifiedAt": None,
        "responseStatus": None,
        "httpStatus": None,
        "errorMessage": None,
        "etagPresent": False,
        "fetchedAt": now.isoformat(),
        "usedCache": False,
    }


def _get_or_create_etag_row(db: Session, endpoint: str, alert_identifier: Optional[str] = None) -> SachetEtagCache:
    row = db.query(SachetEtagCache).filter(SachetEtagCache.endpoint == endpoint).first()
    if not row:
        row = SachetEtagCache(
            endpoint=endpoint,
            alert_identifier=alert_identifier,
            source="SACHET_NDMA",
            source_type="OFFICIAL",
            verification_status="VERIFIED",
            last_checked_at=datetime.utcnow(),
        )
        db.add(row)
        db.flush()
    else:
        if alert_identifier and not row.alert_identifier:
            row.alert_identifier = alert_identifier
        if hasattr(row, "source"):
            row.source = "SACHET_NDMA"
            row.source_type = "OFFICIAL"
            row.verification_status = "VERIFIED"
    return row


def _cache_to_meta(row: SachetEtagCache, meta: Dict[str, Any]) -> None:
    meta["etag"] = row.etag
    meta["etagPresent"] = bool(row.etag)
    meta["cachedXml"] = row.cached_xml
    meta["lastCheckedAt"] = row.last_checked_at.isoformat() if row.last_checked_at else None
    meta["lastSuccessfulFetch"] = row.last_successful_fetch.isoformat() if row.last_successful_fetch else None
    meta["lastModifiedAt"] = row.last_modified_at
    meta["errorMessage"] = row.error_message
    meta["httpStatus"] = row.http_status
    if getattr(row, "fetched_at", None):
        meta["fetchedAt"] = row.fetched_at.isoformat()


def fetch_cap_xml_with_etag(
    client: httpx.Client,
    db: Session,
    alert_identifier: str,
    cap_base_url: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    """
    Official SACHET CAP XML ETag caching.

    FIRST REQUEST (no stored ETag):
      GET {SACHET_CAP_URL}?identifier={REAL_IDENTIFIER}
      Do not send If-None-Match.
      HTTP 200 → store XML, ETag, fetch timestamp, parse, return LIVE.

    SUBSEQUENT REQUEST:
      If-None-Match: "<previous-etag>"
      HTTP 304 → do not replace XML/ETag; use cached XML; lastCheckedAt; NOT_MODIFIED.
      HTTP 200 → replace XML + ETag; lastSuccessfulFetch; parse; LIVE.

    FAILURE:
      Keep last successful XML. Status CACHED or UNAVAILABLE. Never LIVE.
      Do not invent identifiers or fake alerts.
    """
    if not alert_identifier or not str(alert_identifier).strip():
        meta = _empty_meta()
        meta["responseStatus"] = "MISSING_IDENTIFIER"
        meta["errorMessage"] = "SACHET CAP request requires a valid identifier"
        return None, meta

    alert_identifier = str(alert_identifier).strip()
    cap_base = (cap_base_url or settings.SACHET_CAP_URL or "").rstrip("?")
    endpoint = f"{cap_base}?identifier={alert_identifier}"
    meta = _empty_meta(alert_identifier, endpoint)

    cache_row = _get_or_create_etag_row(db, endpoint, alert_identifier)
    stored_etag = (cache_row.etag or "").strip()

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/xml, text/xml, */*",
    }
    if stored_etag:
        headers["If-None-Match"] = _format_etag(stored_etag)

    has_if_none_match = bool(stored_etag)
    print(f"[SACHET] identifier={alert_identifier} request=GET if-none-match={str(has_if_none_match).lower()}")
    logger.info("[SACHET] identifier=%s request=GET if-none-match=%s", alert_identifier, has_if_none_match)

    last_error = None
    timeout = _request_timeout()

    for attempt in range(MAX_RETRIES):
        try:
            resp = client.get(endpoint, headers=headers, timeout=timeout)
            now = datetime.utcnow()
            cache_row.last_checked_at = now
            cache_row.http_status = resp.status_code
            cache_row.alert_identifier = alert_identifier
            if hasattr(cache_row, "fetched_at"):
                cache_row.fetched_at = now
            meta["httpStatus"] = resp.status_code
            meta["lastCheckedAt"] = now.isoformat()
            meta["fetchedAt"] = now.isoformat()

            if resp.status_code == 304:
                print(f"[SACHET] identifier={alert_identifier} status=304 result=NOT_MODIFIED cache=USED")
                logger.info("[SACHET] identifier=%s status=304 result=NOT_MODIFIED cache=USED", alert_identifier)
                cache_row.error_message = None
                if hasattr(cache_row, "response_status"):
                    cache_row.response_status = "NOT_MODIFIED"
                meta["responseStatus"] = "NOT_MODIFIED"
                meta["usedCache"] = True
                _cache_to_meta(cache_row, meta)
                db.commit()
                if cache_row.cached_xml:
                    return _parse_cap_xml(cache_row.cached_xml, source_url=endpoint), meta
                meta["errorMessage"] = "HTTP 304 received but no cached XML available"
                meta["responseStatus"] = "UNAVAILABLE"
                if hasattr(cache_row, "response_status"):
                    cache_row.response_status = "UNAVAILABLE"
                cache_row.error_message = meta["errorMessage"]
                db.commit()
                return None, meta

            if resp.status_code == 200:
                body = resp.text or ""
                new_etag = resp.headers.get("ETag") or resp.headers.get("etag")
                last_modified = resp.headers.get("Last-Modified") or resp.headers.get("last-modified")
                ct = resp.headers.get("content-type", "")

                print(f"[SACHET] identifier={alert_identifier} status=200 etag={new_etag} content-type={ct} size={len(body)}")
                logger.info("[SACHET] identifier=%s status=200 etag=%s content-type=%s size=%s", alert_identifier, new_etag, ct, len(body))

                if not new_etag:
                    logger.warning(
                        "[SACHET] Missing ETag header for %s — continuing only if XML is valid",
                        endpoint,
                    )

                parsed = _parse_cap_xml(body, source_url=endpoint)
                if not parsed:
                    cache_row.error_message = "Invalid CAP XML in HTTP 200 response"
                    if hasattr(cache_row, "response_status"):
                        cache_row.response_status = "INVALID_XML"
                    meta["responseStatus"] = "INVALID_XML"
                    meta["errorMessage"] = cache_row.error_message
                    if cache_row.cached_xml:
                        meta["responseStatus"] = "CACHED"
                        meta["usedCache"] = True
                        if hasattr(cache_row, "response_status"):
                            cache_row.response_status = "CACHED"
                        _cache_to_meta(cache_row, meta)
                        db.commit()
                        return _parse_cap_xml(cache_row.cached_xml, source_url=endpoint), meta
                    db.commit()
                    return None, meta

                cache_row.cached_xml = body
                stored = _store_etag_value(new_etag)
                if stored:
                    cache_row.etag = stored
                cache_row.last_successful_fetch = now
                cache_row.last_modified_at = last_modified
                cache_row.error_message = None
                if hasattr(cache_row, "response_status"):
                    cache_row.response_status = "LIVE"

                meta["responseStatus"] = "LIVE"
                meta["usedCache"] = False
                _cache_to_meta(cache_row, meta)
                db.commit()
                return parsed, meta

            cache_row.error_message = f"HTTP {resp.status_code}"
            meta["errorMessage"] = cache_row.error_message
            if cache_row.cached_xml:
                if hasattr(cache_row, "response_status"):
                    cache_row.response_status = "CACHED"
                meta["responseStatus"] = "CACHED"
                meta["usedCache"] = True
                _cache_to_meta(cache_row, meta)
                db.commit()
                return _parse_cap_xml(cache_row.cached_xml, source_url=endpoint), meta
            if hasattr(cache_row, "response_status"):
                cache_row.response_status = "UNAVAILABLE"
            meta["responseStatus"] = "UNAVAILABLE"
            db.commit()
            return None, meta

        except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPError) as net_err:
            err_str = str(net_err)
            if "certificate" in err_str.lower() or "ssl" in err_str.lower() or "tls" in err_str.lower():
                last_error = f"SACHET TLS ERROR: {err_str}"
                print(f"[SACHET] identifier={alert_identifier} status=TLS_ERROR error={last_error}")
            else:
                last_error = err_str
            wait = min(2 ** attempt, 8)
            logger.warning(
                "[SACHET] Network error fetching %s (attempt %s/%s): %s — retry in %ss",
                endpoint, attempt + 1, MAX_RETRIES, net_err, wait,
            )
            if attempt < MAX_RETRIES - 1:
                time.sleep(wait)

    now = datetime.utcnow()
    cache_row.last_checked_at = now
    cache_row.error_message = last_error or "Request failed"
    cache_row.http_status = None
    if hasattr(cache_row, "fetched_at"):
        cache_row.fetched_at = now
    meta["lastCheckedAt"] = now.isoformat()
    meta["fetchedAt"] = now.isoformat()
    meta["errorMessage"] = cache_row.error_message
    if cache_row.cached_xml:
        print(f"[SACHET] identifier={alert_identifier} status=CACHED cache=FALLBACK")
        logger.info("[SACHET] identifier=%s status=CACHED cache=FALLBACK", alert_identifier)
        if hasattr(cache_row, "response_status"):
            cache_row.response_status = "CACHED"
        meta["responseStatus"] = "CACHED"
        meta["usedCache"] = True
        _cache_to_meta(cache_row, meta)
        db.commit()
        return _parse_cap_xml(cache_row.cached_xml, source_url=endpoint), meta

    print(f"[SACHET] identifier={alert_identifier} status=UNAVAILABLE cache=FALLBACK")
    logger.info("[SACHET] identifier=%s status=UNAVAILABLE cache=FALLBACK", alert_identifier)
    if hasattr(cache_row, "response_status"):
        cache_row.response_status = "UNAVAILABLE"
    meta["responseStatus"] = "UNAVAILABLE"
    _cache_to_meta(cache_row, meta)
    db.commit()
    return None, meta


def fetch_sachet_alert(
    identifier: Optional[str] = None,
    db: Optional[Session] = None,
    cap_base_url: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    """
    Fetch an individual official SACHET CAP XML alert with ETag conditional caching.
    Supports dynamic identifier or settings.SACHET_ALERT_IDENTIFIER.
    If no valid identifier is configured/supplied, returns SACHET_NOT_CONFIGURED.
    """
    target_id = (identifier or getattr(settings, "SACHET_ALERT_IDENTIFIER", "") or "").strip()
    if not target_id:
        meta = _empty_meta()
        meta["status"] = "SACHET_NOT_CONFIGURED"
        meta["responseStatus"] = "NOT_CONFIGURED"
        meta["error"] = "SACHET identifier is not configured."
        return None, meta

    close_db = False
    if db is None:
        from ..database import SessionLocal
        db = SessionLocal()
        close_db = True

    try:
        with httpx.Client(timeout=15.0, verify=True) as client:
            return fetch_cap_xml_with_etag(client, db, target_id, cap_base_url=cap_base_url)
    finally:
        if close_db:
            db.close()


def sync_sachet_alert(
    identifier: Optional[str] = None,
    db: Optional[Session] = None,
    cap_base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Synchronize an official SACHET alert by identifier into the database with ETag deduplication.
    Follows Parts 1, 4, 9, 10 of the SIH 2026 specification.
    """
    target_id = (identifier or getattr(settings, "SACHET_ALERT_IDENTIFIER", "") or "").strip()
    if not target_id:
        return {
            "status": "SACHET_NOT_CONFIGURED",
            "connection_status": "NOT CONFIGURED",
            "identifier": None,
            "error": "SACHET identifier is not configured.",
            "synced": False,
        }

    close_db = False
    if db is None:
        from ..database import SessionLocal
        db = SessionLocal()
        close_db = True

    try:
        parsed, meta = fetch_sachet_alert(target_id, db=db, cap_base_url=cap_base_url)
        resp_status = meta.get("responseStatus") or "UNAVAILABLE"

        if parsed:
            ident = parsed["identifier"]
            existing = db.query(DisasterAlert).filter(DisasterAlert.identifier == ident).first()
            now = datetime.utcnow()
            if not existing:
                alert_obj = DisasterAlert(**parsed)
                db.add(alert_obj)
            else:
                for k, v in parsed.items():
                    setattr(existing, k, v)
                existing.fetched_at = now
                existing.updated_at = now
            db.commit()

            # Filter expired
            db.query(DisasterAlert).filter(
                DisasterAlert.is_active == True,
                DisasterAlert.expires_at != None,
                DisasterAlert.expires_at < now,
            ).update({DisasterAlert.is_active: False})
            db.commit()

        return {
            "status": "UPDATED" if resp_status == "LIVE" else ("NOT_MODIFIED" if resp_status == "NOT_MODIFIED" else resp_status),
            "responseStatus": resp_status,
            "identifier": target_id,
            "etag": meta.get("etag"),
            "etagPresent": meta.get("etagPresent", False),
            "usedCache": meta.get("usedCache", False),
            "httpStatus": meta.get("httpStatus"),
            "lastCheckedAt": meta.get("lastCheckedAt"),
            "lastSuccessfulFetch": meta.get("lastSuccessfulFetch"),
            "alert": parsed,
            "error": meta.get("errorMessage"),
        }
    finally:
        if close_db:
            db.close()


def get_sachet_sync_status(db: Session) -> Dict[str, Any]:
    """
    Honest SACHET connection state for UI and API consumers.

    Status codes (canonical):
      LIVE | NOT_MODIFIED | CACHED | UNAVAILABLE | NOT_CONFIGURED

    Legacy badge labels retained for existing UI:
      LIVE | CACHED OFFICIAL DATA | FEED UNAVAILABLE | NOT CONFIGURED
    """
    cap_url = getattr(settings, "SACHET_CAP_URL", "") or ""
    index_url = getattr(settings, "SACHET_ALERT_INDEX_URL", "") or getattr(settings, "SACHET_LISTING_URL", "") or ""

    now = datetime.utcnow()
    active_count = db.query(DisasterAlert).filter(
        DisasterAlert.is_active == True,
        (DisasterAlert.expires_at == None) | (DisasterAlert.expires_at >= now),
    ).count()
    expired_count = db.query(DisasterAlert).filter(
        (DisasterAlert.is_active == False)
        | ((DisasterAlert.expires_at != None) & (DisasterAlert.expires_at < now))
    ).count()
    total_count = db.query(DisasterAlert).count()

    etag_rows = db.query(SachetEtagCache).all()
    etag_present = any(bool(r.etag) for r in etag_rows)
    latest_etag_check = max((r.last_checked_at for r in etag_rows if r.last_checked_at), default=None)
    latest_etag_success = max((r.last_successful_fetch for r in etag_rows if r.last_successful_fetch), default=None)
    etag_success_sorted = sorted(
        [x for x in etag_rows if x.last_successful_fetch],
        key=lambda x: x.last_successful_fetch or datetime.min,
        reverse=True,
    )
    latest_modified = next((r.last_modified_at for r in etag_success_sorted if r.last_modified_at), None)

    last_log = db.query(APISyncLog).filter(
        APISyncLog.service_name == "SACHET_NDMA"
    ).order_by(APISyncLog.sync_timestamp.desc()).first()

    last_success_log = db.query(APISyncLog).filter(
        APISyncLog.service_name == "SACHET_NDMA",
        APISyncLog.status.in_(["SUCCESS", "NOT_MODIFIED"]),
    ).order_by(APISyncLog.sync_timestamp.desc()).first()

    last_success_time = latest_etag_success or (last_success_log.sync_timestamp if last_success_log else None)
    last_checked = latest_etag_check or (last_log.sync_timestamp if last_log else None)

    index_configured = bool(index_url and len(index_url.strip()) > 8)
    cap_configured = bool(settings.is_sachet_configured and cap_url)

    latest_identifier = next((r.identifier for r in etag_success_sorted if r.identifier), None) or getattr(settings, "SACHET_ALERT_IDENTIFIER", None) or (discovered_identifiers[0] if 'discovered_identifiers' in locals() and discovered_identifiers else None)

    if not cap_configured:
        return {
            "source": "SACHET_NDMA",
            "status": "NOT_CONFIGURED",
            "statusCode": "NOT_CONFIGURED",
            "statusBadge": "NOT CONFIGURED",
            "connection_state": "NOT_CONFIGURED",
            "identifier": getattr(settings, "SACHET_ALERT_IDENTIFIER", "") or None,
            "is_live": False,
            "httpStatus": None,
            "http_status": None,
            "lastCheckedAt": None,
            "last_checked_at": None,
            "lastSuccessfulFetch": None,
            "last_successful_fetch": None,
            "lastModifiedAt": None,
            "last_modified_at": None,
            "last_updated": "Never",
            "last_successful_fetch_time": None,
            "last_sync_timestamp": None,
            "alertCount": 0,
            "activeAlertCount": 0,
            "active_alert_count": 0,
            "expiredAlertCount": 0,
            "expired_alert_count": 0,
            "total_active_alerts": 0,
            "total_stored_alerts": 0,
            "etagPresent": False,
            "etag_present": False,
            "error": "SACHET_CAP_URL is not configured",
            "officialSourceUrl": OFFICIAL_PORTAL,
            "official_endpoint": cap_url,
            "listing_endpoint": index_url,
            "alertIndexConfigured": index_configured,
            "alertIndexStatus": "CONFIGURED" if index_configured else "SACHET ALERT INDEX NOT CONFIGURED",
            "feed_details": {"error": "SACHET_CAP_URL is not configured"},
        }

    relative_time = "Never"
    if last_success_time:
        diff_mins = max(0, int((now - last_success_time).total_seconds() / 60))
        if diff_mins < 60:
            relative_time = f"{diff_mins} min ago" if diff_mins > 0 else "Just now"
        else:
            relative_time = f"{diff_mins // 60}h ago"

    # Determine status from latest sync / etag outcomes
    status_code = "UNAVAILABLE"
    status_badge = "FEED UNAVAILABLE"
    is_live = False
    http_status = (last_log.response_time_ms if last_log else None)  # placeholder; prefer etag http
    recent_etag_statuses = [r.http_status for r in etag_rows if r.last_checked_at and (now - r.last_checked_at).total_seconds() < 3600]
    recent_http = next((s for s in recent_etag_statuses if s is not None), None)
    if last_log and getattr(last_log, "error_message", None) is None and last_log.status == "SUCCESS":
        recent_http = recent_http or 200
    if last_log and last_log.status == "NOT_MODIFIED":
        recent_http = 304

    last_error = None
    if last_log and last_log.status == "FAILED":
        last_error = last_log.error_message

    if last_log and last_log.status == "NOT_MODIFIED":
        status_code = "NOT_MODIFIED"
        status_badge = "NOT MODIFIED — USING CACHED OFFICIAL XML"
        is_live = False
        http_status = 304
        last_error = None
    elif last_success_time and last_log and last_log.status == "SUCCESS":
        diff_mins = max(0, int((now - last_success_time).total_seconds() / 60))
        # LIVE only if a recent official fetch returned updated XML (not merely DB age)
        if diff_mins <= 45:
            status_code = "LIVE"
            status_badge = "LIVE OFFICIAL DATA"
            is_live = True
            http_status = 200
        else:
            status_code = "CACHED"
            status_badge = "CACHED OFFICIAL DATA"
            is_live = False
            http_status = recent_http
        last_error = None
    elif total_count > 0 or active_count > 0:
        if last_log and last_log.status == "FAILED":
            err_str = (last_log.error_message or "").lower()
            if "xml" in err_str or "parse" in err_str:
                status_code = "INVALID_XML"
                status_badge = "SACHET RESPONSE INVALID — USING LAST SUCCESSFUL OFFICIAL DATA"
            else:
                status_code = "TIMEOUT"
                status_badge = "CHECK TIMEOUT — USING LAST SUCCESSFUL OFFICIAL DATA"
        else:
            status_code = "CACHED"
            status_badge = "CACHED OFFICIAL DATA"
        is_live = False
        http_status = recent_http
    else:
        status_code = "UNAVAILABLE"
        status_badge = "FEED UNAVAILABLE"
        is_live = False

    # Map canonical → legacy labels expected by older clients/tests
    legacy_status = {
        "LIVE": "LIVE",
        "NOT_MODIFIED": "CACHED OFFICIAL DATA",
        "CACHED": "CACHED OFFICIAL DATA",
        "TIMEOUT": "CACHED OFFICIAL DATA",
        "INVALID_XML": "CACHED OFFICIAL DATA",
        "UNAVAILABLE": "FEED UNAVAILABLE",
        "NOT_CONFIGURED": "NOT CONFIGURED",
    }.get(status_code, status_badge)

    calc_http = int(http_status) if isinstance(http_status, (int, float)) and http_status in (200, 304) else (200 if is_live else recent_http)
    last_chk_iso = last_checked.isoformat() if last_checked else None
    last_succ_iso = last_success_time.isoformat() if last_success_time else None

    # Canonical status field (exact schema required by PART 7 & API contract)
    return {
        "source": "NDMA SACHET",
        "status": status_code,
        "statusCode": status_code,
        "statusBadge": status_badge,
        "legacyStatus": legacy_status,
        "connection_state": status_code,
        "identifier": latest_identifier,
        "is_live": is_live,
        "httpStatus": calc_http,
        "http_status": calc_http,
        "lastCheckedAt": last_chk_iso,
        "last_checked_at": last_chk_iso,
        "lastSuccessfulFetch": last_succ_iso,
        "last_successful_fetch": last_succ_iso,
        "lastModifiedAt": latest_modified,
        "last_modified_at": latest_modified,
        "last_updated": relative_time,
        "last_successful_fetch_time": last_succ_iso,
        "last_sync_timestamp": last_chk_iso,
        "alertCount": total_count,
        "activeAlertCount": active_count,
        "active_alert_count": active_count,
        "expiredAlertCount": expired_count,
        "expired_alert_count": expired_count,
        "total_active_alerts": active_count,
        "total_stored_alerts": total_count,
        "etagPresent": etag_present,
        "etag_present": etag_present,
        "error": last_error,
        "officialSourceUrl": OFFICIAL_PORTAL,
        "official_endpoint": cap_url,
        "listing_endpoint": index_url,
        "alertIndexConfigured": index_configured,
        "alertIndexStatus": "CONFIGURED" if index_configured else "SACHET ALERT INDEX NOT CONFIGURED",
        "pollIntervalSec": POLL_INTERVAL_SEC,
        "feed_details": {
            "last_attempt_status": last_log.status if last_log else "NEVER_RUN",
            "last_error": last_error,
            "response_time_ms": last_log.response_time_ms if last_log else None,
            "etag_cache_entries": len(etag_rows),
        },
    }


def sync_sachet_ndma_alerts(db: Session, max_alerts_to_fetch: int = 50) -> Dict[str, Any]:
    """
    Full SACHET Integration Flow with ETag caching:
    1. Discover identifiers from official alert index (if configured).
    2. For each identifier, FetchXMLFile?identifier=... with If-None-Match.
    3. Handle HTTP 200 / 304 / errors per official ETag guide.
    4. Parse CAP, upsert, expire, audit.
    """
    start_time = datetime.utcnow()
    synced_count = 0
    updated_count = 0
    not_modified_count = 0
    error_msg = None
    http_status_logged = None
    content_type_logged = None
    overall_response_status = "UNAVAILABLE"

    cap_base_url = settings.SACHET_CAP_URL or settings.SACHET_NDMA_BASE_URL
    listing_url = settings.SACHET_ALERT_INDEX_URL or settings.SACHET_LISTING_URL

    if not settings.is_sachet_configured or not cap_base_url:
        print("[SACHET] Service not configured.")
        return {
            "status": "not_configured",
            "connection_status": "NOT CONFIGURED",
            "statusCode": "NOT_CONFIGURED",
            "synced_count": 0,
            "error": "SACHET_CAP_URL is not configured",
        }

    if not listing_url or len(listing_url.strip()) < 8:
        print("[SACHET] Alert index URL not configured — cannot discover identifiers without inventing them.")
        # Still report cached status if we have data
        cached = db.query(DisasterAlert).count() > 0
        return {
            "status": "failed",
            "connection_status": "CACHED OFFICIAL DATA" if cached else "FEED UNAVAILABLE",
            "statusCode": "CACHED" if cached else "UNAVAILABLE",
            "synced_count": 0,
            "error": "SACHET ALERT INDEX NOT CONFIGURED — set SACHET_ALERT_INDEX_URL to discover live identifiers",
            "alertIndexStatus": "SACHET ALERT INDEX NOT CONFIGURED",
        }

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json, text/xml, */*"}
    discovered_identifiers: List[str] = []
    listing_meta_map: Dict[str, Any] = {}

    try:
        with httpx.Client(timeout=_request_timeout(), verify=True) as client:
            print(f"[SACHET] Discovering active alerts from {listing_url}...")
            list_resp = client.get(listing_url, headers=headers)
            http_status_logged = list_resp.status_code
            content_type_logged = list_resp.headers.get("content-type", "")
            print(f"[SACHET] Listing HTTP {http_status_logged}, Content-Type: {content_type_logged}, Length: {len(list_resp.text)} bytes")

            if list_resp.status_code != 200:
                raise Exception(f"Official SACHET listing returned HTTP {http_status_logged} ({content_type_logged})")

            try:
                raw_list = list_resp.json()
            except Exception as json_err:
                raise Exception(f"Failed to parse SACHET listing as JSON: {json_err} (Content-Type: {content_type_logged})")

            if not isinstance(raw_list, list):
                raise Exception(f"SACHET listing did not return expected array (got {type(raw_list)})")

            for item in raw_list:
                raw_id = item.get("identifier") or item.get("alert_id_sdma_autoinc")
                if raw_id:
                    sid = str(raw_id).strip()
                    discovered_identifiers.append(sid)
                    listing_meta_map[sid] = item

            print(f"[SACHET] Successfully discovered {len(discovered_identifiers)} valid alert identifiers from official feed.")
            target_ids = discovered_identifiers[:max_alerts_to_fetch]

            def fetch_single_cap(alert_id: str) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
                # Each worker needs its own DB session-safe path: use shared client + etag via thread-local db ops carefully.
                # Use a short-lived approach: fetch_cap_xml_with_etag commits per alert.
                return fetch_cap_xml_with_etag(client, db, alert_id, cap_base_url)

            parsed_alerts: List[Dict[str, Any]] = []
            live_hits = 0
            # Sequential fetch to keep SQLite session thread-safe with ETag writes
            for alert_id in target_ids:
                parsed, meta = fetch_single_cap(alert_id)
                if meta.get("responseStatus") == "NOT_MODIFIED":
                    not_modified_count += 1
                if meta.get("responseStatus") == "LIVE":
                    live_hits += 1
                if not parsed:
                    continue
                if not parsed.get("polygon_geojson") and not parsed.get("circle_coordinates") and alert_id in listing_meta_map:
                    meta_item = listing_meta_map[alert_id]
                    centroid = meta_item.get("centroid")
                    if centroid and "," in str(centroid):
                        parsed["circle_coordinates"] = str(centroid)
                # Drop non-persisted meta before ORM
                parsed.pop("cap_meta", None)
                parsed_alerts.append(parsed)

            print(f"[SACHET] Parsed {len(parsed_alerts)} CAP alerts (live={live_hits}, not_modified={not_modified_count}).")

            for al_data in parsed_alerts:
                ident = al_data["identifier"]
                existing = db.query(DisasterAlert).filter(DisasterAlert.identifier == ident).first()
                persist_fields = {k: v for k, v in al_data.items() if hasattr(DisasterAlert, k)}
                if not existing:
                    new_alert = DisasterAlert(**persist_fields)
                    db.add(new_alert)
                    synced_count += 1
                else:
                    for k, v in persist_fields.items():
                        setattr(existing, k, v)
                    existing.fetched_at = datetime.utcnow()
                    updated_count += 1

            db.commit()

            if live_hits > 0:
                overall_response_status = "LIVE"
            elif not_modified_count > 0:
                overall_response_status = "NOT_MODIFIED"
            elif parsed_alerts:
                overall_response_status = "CACHED"
            else:
                overall_response_status = "UNAVAILABLE"

    except Exception as e:
        error_msg = str(e)
        print(f"[SACHET] Feed synchronization failed: {e}")
        if db.query(DisasterAlert).count() > 0:
            err_str = error_msg.lower()
            if "xml" in err_str or "parse" in err_str:
                overall_response_status = "INVALID_XML"
            else:
                overall_response_status = "TIMEOUT"
        else:
            overall_response_status = "UNAVAILABLE"

    now = datetime.utcnow()
    try:
        db.query(DisasterAlert).filter(
            DisasterAlert.is_active == True,
            DisasterAlert.expires_at != None,
            DisasterAlert.expires_at < now,
        ).update({DisasterAlert.is_active: False})
        db.commit()
    except Exception as exp_err:
        print(f"[SACHET] Expired alert cleanup error: {exp_err}")

    duration = (datetime.utcnow() - start_time).total_seconds() * 1000

    sync_status_for_log = "SUCCESS"
    if error_msg:
        sync_status_for_log = "FAILED"
    elif overall_response_status == "NOT_MODIFIED":
        sync_status_for_log = "NOT_MODIFIED"

    try:
        sync_log = APISyncLog(
            service_name="SACHET_NDMA",
            status=sync_status_for_log,
            items_synced=synced_count + updated_count,
            response_time_ms=round(duration, 2),
            error_message=error_msg,
            sync_timestamp=datetime.utcnow(),
        )
        db.add(sync_log)

        ds = db.query(DataSource).filter(DataSource.name.ilike("%SACHET%")).first()
        if ds:
            ds.last_sync_at = datetime.utcnow()
            ds.status = "Operational" if not error_msg else "Degraded"

        db.commit()
    except Exception as log_err:
        print(f"[SACHET] Audit logging error: {log_err}")

    connection_status_map = {
        "LIVE": "LIVE OFFICIAL DATA",
        "NOT_MODIFIED": "NOT MODIFIED — USING CACHED OFFICIAL XML",
        "CACHED": "CACHED OFFICIAL DATA",
        "TIMEOUT": "CHECK TIMEOUT — USING LAST SUCCESSFUL OFFICIAL DATA",
        "INVALID_XML": "SACHET RESPONSE INVALID — USING LAST SUCCESSFUL OFFICIAL DATA",
        "UNAVAILABLE": "FEED UNAVAILABLE",
        "NOT_CONFIGURED": "NOT CONFIGURED",
    }
    connection_status = connection_status_map.get(overall_response_status, "FEED UNAVAILABLE")
    if error_msg and db.query(DisasterAlert).count() > 0:
        if "xml" in error_msg.lower() or "parse" in error_msg.lower():
            connection_status = "SACHET RESPONSE INVALID — USING LAST SUCCESSFUL OFFICIAL DATA"
            overall_response_status = "INVALID_XML"
        else:
            connection_status = "CHECK TIMEOUT — USING LAST SUCCESSFUL OFFICIAL DATA"
            overall_response_status = "TIMEOUT"

    total_active = db.query(DisasterAlert).filter(
        DisasterAlert.is_active == True,
        (DisasterAlert.expires_at == None) | (DisasterAlert.expires_at >= now),
    ).count()

    return {
        "status": "success" if not error_msg else "failed",
        "connection_status": connection_status,
        "statusCode": overall_response_status,
        "synced_count": synced_count,
        "updated_count": updated_count,
        "not_modified_count": not_modified_count,
        "total_active_alerts": total_active,
        "duration_ms": round(duration, 2),
        "source": "SACHET_NDMA",
        "officialSourceUrl": OFFICIAL_PORTAL,
        "http_status": http_status_logged,
        "content_type": content_type_logged,
        "error": error_msg,
        "etagCaching": True,
    }


def categorize_disaster_event(event_text: Optional[str]) -> str:
    """Normalize event text into standardized disaster categories."""
    ev = (event_text or "").upper()
    if any(k in ev for k in ["LANDSLIDE", "MUDSLIDE", "ROCKFALL"]):
        return "LANDSLIDE"
    elif any(k in ev for k in ["FLOOD", "INUNDATION"]):
        return "FLOOD"
    elif any(k in ev for k in ["THUNDERSTORM", "LIGHTNING", "THUNDER"]):
        return "THUNDERSTORM"
    elif any(k in ev for k in ["CYCLONE", "GALE", "SQUALL", "WIND", "STORM"]):
        return "CYCLONE"
    elif any(k in ev for k in ["EARTHQUAKE", "TREMOR", "SEISMIC"]):
        return "EARTHQUAKE"
    elif any(k in ev for k in ["FIRE", "WILDFIRE", "FOREST FIRE"]):
        return "FIRE"
    elif any(k in ev for k in ["HEAVY RAIN", "RAINFALL", "PRECIPITATION", "DOWNPOUR"]):
        return "HEAVY RAIN"
    elif any(k in ev for k in ["HEAT", "HEATWAVE", "HOT"]):
        return "HEATWAVE"
    elif any(k in ev for k in ["DROUGHT"]):
        return "DROUGHT"
    elif any(k in ev for k in ["TSUNAMI"]):
        return "TSUNAMI"
    return "OTHER"


def parse_and_normalize_geometry(
    circle_coordinates: Optional[str] = None,
    polygon_geojson: Optional[str] = None,
    geocode: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Parses CAP geographic coordinates with intelligent coordinate-order detection.
    India bounding box:
      - Latitude: 6.0 deg N to 38.5 deg N
      - Longitude: 68.0 deg E to 98.5 deg E
    Never invents coordinates. Flags has_valid_location = False if unavailable.
    """
    lat: Optional[float] = None
    lon: Optional[float] = None
    radius_km: float = 10.0
    has_valid: bool = False
    geom_type = "None"
    coordinates = None
    polygon_positions = None

    # 1. Circle coordinates
    if circle_coordinates:
        import re
        nums = [float(p) for p in re.findall(r'[-+]?\d*\.?\d+', str(circle_coordinates))]
        if len(nums) >= 2:
            v1, v2 = nums[0], nums[1]
            if len(nums) >= 3 and nums[2] > 0:
                radius_km = nums[2]
            # Detect order using geographic constraints for India
            if 6.0 <= v1 <= 38.5 and 68.0 <= v2 <= 98.5:
                lat, lon = v1, v2
                has_valid = True
                geom_type = "Circle"
                coordinates = [lon, lat]
            elif 68.0 <= v1 <= 98.5 and 6.0 <= v2 <= 38.5:
                # Longitude, Latitude detected
                lat, lon = v2, v1
                has_valid = True
                geom_type = "Circle"
                coordinates = [lon, lat]
            elif -90.0 <= v1 <= 90.0 and -180.0 <= v2 <= 180.0:
                lat, lon = v1, v2
                has_valid = True
                geom_type = "Circle"
                coordinates = [lon, lat]

    # 2. Polygon GeoJSON / CAP polygon string fallback
    if polygon_geojson and not has_valid:
        try:
            poly_data = json.loads(polygon_geojson) if isinstance(polygon_geojson, str) and polygon_geojson.strip().startswith("{") else None
            if poly_data and "coordinates" in poly_data:
                coords = poly_data["coordinates"]
                ring = coords[0] if coords and isinstance(coords[0], list) else coords
                if ring:
                    avg_lon = sum(pt[0] for pt in ring) / len(ring)
                    avg_lat = sum(pt[1] for pt in ring) / len(ring)
                    lat, lon = avg_lat, avg_lon
                    has_valid = True
                    geom_type = "Polygon"
                    coordinates = coords
                    polygon_positions = [[pt[1], pt[0]] for pt in ring]
        except Exception:
            pass

    return {
        "latitude": lat,
        "longitude": lon,
        "radius_km": radius_km,
        "has_valid_location": has_valid,
        "geometry": {"type": geom_type, "coordinates": coordinates} if has_valid else None,
        "polygon_positions": polygon_positions,
    }


def get_active_sachet_alerts(db: Session, state: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve active official SACHET alerts filtered optionally by state."""
    now = datetime.utcnow()
    q = db.query(DisasterAlert).filter(
        DisasterAlert.is_active == True,
        (DisasterAlert.expires_at == None) | (DisasterAlert.expires_at >= now),
    )
    if state and state.lower() != "all":
        q = q.filter(DisasterAlert.area_description.ilike(f"%{state}%"))
    alerts = q.order_by(DisasterAlert.fetched_at.desc()).limit(150).all()

    res = []
    for a in alerts:
        age = None
        if a.sent_at:
            age_mins = int((now - a.sent_at).total_seconds() / 60)
            age = f"{age_mins} min" if age_mins < 60 else f"{age_mins // 60}h"
        freshness = "LIVE" if a.fetched_at and (now - a.fetched_at).total_seconds() < 2700 else "CACHED_OFFICIAL"

        # Geographic normalization
        geom_info = parse_and_normalize_geometry(
            circle_coordinates=a.circle_coordinates,
            polygon_geojson=a.polygon_geojson,
            geocode=a.geocode,
        )
        category = categorize_disaster_event(a.event)

        res.append({
            "id": a.id,
            "identifier": a.identifier,
            "sender": a.sender,
            "event": a.event,
            "disaster_type": category,
            "event_type": category,
            "headline": a.headline,
            "description": a.description,
            "area_description": a.area_description,
            "area": a.area_description,
            "severity": a.severity,
            "raw_severity": getattr(a, "raw_severity", None) or a.severity,
            "urgency": a.urgency,
            "certainty": a.certainty,
            "status": a.status,
            "sent_at": a.sent_at.isoformat() if a.sent_at else None,
            "issued_at": a.sent_at.isoformat() if a.sent_at else None,
            "effective_at": a.effective_at.isoformat() if a.effective_at else (a.sent_at.isoformat() if a.sent_at else None),
            "expires_at": a.expires_at.isoformat() if a.expires_at else None,
            "instruction": a.instruction,
            "source_url": a.source_url or (
                f"{OFFICIAL_PORTAL}/cap_public_website/FetchXMLFile?identifier={a.identifier}" if a.identifier else None
            ),
            "polygon_geojson": a.polygon_geojson,
            "circle_coordinates": a.circle_coordinates,
            "latitude": geom_info["latitude"],
            "longitude": geom_info["longitude"],
            "radius_km": geom_info["radius_km"],
            "geometry": geom_info["geometry"],
            "has_valid_location": geom_info["has_valid_location"],
            "polygon_positions": geom_info["polygon_positions"],
            "is_active": a.is_active,
            "fetched_at": a.fetched_at.isoformat() if a.fetched_at else None,
            "source": "NDMA SACHET",
            "sourceType": getattr(a, "source_type", None) or "OFFICIAL",
            "verificationStatus": getattr(a, "verification_status", None) or "VERIFIED",
            "verified": True,
            "source_badge": "NDMA SACHET (VERIFIED)",
            "alertAge": age,
            "dataFreshness": freshness,
            "officialSourceUrl": OFFICIAL_PORTAL,
        })
    return res


def filter_alerts_for_route(
    db: Session,
    route_coordinates: List[List[float]],
    buffer_km: float = 12.0,
) -> Dict[str, Any]:
    """
    Separate route-intersecting hazards from regional alerts.
    route_coordinates: [[lon, lat], ...]
    """
    from .route_engine import _check_hazard_intersection, _haversine_distance_km

    route_hazards = _check_hazard_intersection(route_coordinates, db, buffer_radius_km=buffer_km) if route_coordinates else []

    route_alert_ids = set()
    route_alerts = []
    user_on_route = []
    closures_on_route = []

    for h in route_hazards:
        src = h.get("source")
        if src == "NDMA_SACHET" or src == "SACHET_NDMA":
            route_alerts.append(h)
            if h.get("id"):
                route_alert_ids.add(h["id"])
        elif src == "USER_REPORTED":
            user_on_route.append(h)
        elif src in ("ADMIN_CLOSURE", "INCIDENT", "ROAD_CLOSURE"):
            closures_on_route.append(h)
        else:
            # Treat administrative incidents as closures when flagged
            if h.get("type") in ("Road Closure", "Blockage", "Closure"):
                closures_on_route.append(h)
            else:
                route_alerts.append(h)

    now = datetime.utcnow()
    all_official = db.query(DisasterAlert).filter(
        DisasterAlert.is_active == True,
        (DisasterAlert.expires_at == None) | (DisasterAlert.expires_at >= now),
    ).all()

    regional = []
    for a in all_official:
        if a.id in route_alert_ids:
            continue
        regional.append({
            "id": a.id,
            "identifier": a.identifier,
            "event": a.event,
            "headline": a.headline,
            "severity": a.severity,
            "area_description": a.area_description,
            "source": "SACHET_NDMA",
            "verificationStatus": "VERIFIED",
            "onRoute": False,
            "source_badge": "NDMA SACHET (VERIFIED)",
        })

    all_user = db.query(UserReport).filter(UserReport.status != "DELETED").all()
    user_off = []
    on_route_user_ids = {h.get("id") for h in user_on_route}
    for u in all_user:
        v_status = (u.verification_status or "AI_REVIEW").upper()
        legacy_status = (u.status or "PENDING").upper()
        if v_status == "AI_REJECTED" or legacy_status in ["REJECTED", "REJECT"]:
            continue
        if u.id in on_route_user_ids:
            continue
        is_conf = (v_status == "AI_VERIFIED") or (legacy_status in ["APPROVED", "VERIFIED", "ACTIVE"] and v_status != "AI_REJECTED")
        user_off.append({
            "id": u.id,
            "type": u.disaster_type,
            "severity": u.severity,
            "latitude": u.latitude,
            "longitude": u.longitude,
            "source": "USER_REPORTED",
            "verificationStatus": "VERIFIED" if is_conf else "REVIEW_REQUIRED",
            "onRoute": False,
            "source_badge": "AI VERIFIED CITIZEN REPORT" if is_conf else "AI REVIEW REQUIRED",
        })

    risk = min(100, len(route_alerts) * 25 + len(user_on_route) * 15 + len(closures_on_route) * 30)

    return {
        "routeAlerts": route_alerts,
        "regionalAlerts": regional,
        "userReportedAlerts": user_on_route + [{"_offRoute": True, **x} for x in user_off[:20]],
        "roadClosures": closures_on_route,
        "summary": {
            "officialAlertsOnRoute": len(route_alerts),
            "userReportsOnRoute": len(user_on_route),
            "roadClosuresOnRoute": len(closures_on_route),
            "regionalAlertsCount": len(regional),
            "routeRiskScore": risk,
        },
    }
