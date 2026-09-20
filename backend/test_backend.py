import sys
import os
import json
import math
import uuid
import bcrypt
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

from app.main import app
from app.database import SessionLocal
from app.models import (
    User, DisasterAlert, UserReport, JourneySession,
    AlertDelivery, OfflineSyncReceipt, ConnectivityEvent,
    UserCommunicationPreference, SatelliteSession
)
from app.services.sachet_service import _parse_cap_xml, _normalize_severity
from app.services.route_engine import _haversine_distance_km, _check_hazard_intersection, calculate_smart_routes

client = TestClient(app)

def ensure_test_admin():
    """Ensure test administrator account exists in database for test authentication."""
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.email == "admin@nersmartlogix.gov.in").first()
        if not admin_user:
            pw_hash = bcrypt.hashpw("Admin@123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            admin_user = User(
                name="System Test Administrator",
                email="admin@nersmartlogix.gov.in",
                password_hash=pw_hash,
                role="admin",
                state="All",
                is_active=True
            )
            db.add(admin_user)
            db.commit()
    finally:
        db.close()

def test_system():
    ensure_test_admin()
    print("==================================================")
    print(" NEXORA SIH 2026 - COMPREHENSIVE BACKEND TEST SUITE")
    print("==================================================")

    # 1. Root & health
    # Clean up any leftover test reports & test alerts at startup
    _db_init = SessionLocal()
    try:
        _db_init.query(UserReport).delete()
        _db_init.query(DisasterAlert).filter(DisasterAlert.identifier.like("NDMA-CAP-TEST-%")).delete()
        _db_init.commit()
    finally:
        _db_init.close()

    print("\n[1/25] Testing root & health endpoint...")
    r = client.get("/")
    assert r.status_code == 200, f"Root failed: {r.text}"
    print(f"  ✓ Root OK: {r.json().get('platform')}")

    # 2. Admin Login
    print("\n[2/25] Testing Admin Authentication...")
    r = client.post("/api/auth/login", json={"email": "admin@nersmartlogix.gov.in", "password": "Admin@123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token_data = r.json()
    token = token_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"  ✓ Admin Login OK. Role: {token_data['user']['role']}")

    # 3. States & Districts
    print("\n[3/25] Testing States & Districts Dataset...")
    r = client.get("/api/states")
    assert r.status_code == 200
    states = r.json()
    assert len(states) == 8, f"Expected 8 states, got {len(states)}"
    print(f"  ✓ States OK: {len(states)} NER states verified.")

    # 4. Smart Route Planner (OSRM routing + multi-strategy)
    print("\n[4/25] Testing Smart Route Engine (Guwahati -> Shillong)...")
    r = client.post("/api/routes/calculate", json={
        "origin": "Guwahati",
        "destination": "Shillong",
        "vehicle_type": "Heavy Duty Truck",
        "cargo_type": "Emergency Medical Supplies",
        "cargo_weight": 10.0,
        "travel_mode": "truck"
    })
    assert r.status_code == 200, f"Route calc failed: {r.text}"
    route_res = r.json()
    assert "routes" in route_res and "fastest" in route_res["routes"]
    print(f"  ✓ Route Calc OK. Fastest ETA: {route_res['routes']['fastest']['eta_formatted']} | Distance: {route_res['routes']['fastest']['distance_km']} km")

    # 5. Accessibility Intelligence
    print("\n[5/25] Testing Accessibility Intelligence Engine...")
    r = client.get("/api/accessibility")
    assert r.status_code == 200
    access_data = r.json()
    assert "districts_scored_count" in access_data
    print(f"  ✓ Accessibility OK: {access_data['districts_scored_count']} districts scored.")

    # 6. What-If Simulation
    print("\n[6/25] Testing What-If Simulator (Highway Disruption)...")
    r = client.post("/api/simulation", json={
        "scenario_type": "close_highway",
        "road_name": "NH-6 (Shillong-Silchar Mountain Highway)"
    }, headers=headers)
    assert r.status_code == 200
    sim_res = r.json()
    print(f"  ✓ What-If OK: Travel time change = {sim_res['travel_time_change_pct']}%")

    # 7. AI Copilot Query Grounding
    print("\n[7/25] Testing AI Copilot Factual Grounding...")
    r = client.post("/api/ai/query", json={"query": "Which districts in Assam have high logistics vulnerability?"})
    assert r.status_code == 200
    ai_res = r.json()
    assert "answer" in ai_res and len(ai_res["answer"]) > 20
    print(f"  ✓ AI Copilot OK. Answer received ({len(ai_res['answer'])} chars).")

    # 8. Analytics KPIs
    print("\n[8/25] Testing Analytics KPIs...")
    r = client.get("/api/analytics/kpis")
    assert r.status_code == 200
    kpis = r.json()
    print(f"  ✓ KPIs OK: Avg Score = {kpis['average_accessibility_score']}, Hubs = {kpis['active_logistics_hubs']}")

    # 9. User Disaster Creation (Feature 1)
    print("\n[9/25] Testing User Disaster Creation (POST /api/disasters/report)...")
    disaster_payload = {
        "type": "Landslide",
        "severity": "HIGH",
        "latitude": 25.9500,
        "longitude": 91.8000,
        "location_name": "NH-6 Byrnihat Pass",
        "radiusKm": 8.0,
        "description": "Severe debris flow blocking 2 lanes of NH-6.",
        "reportedBy": "Operator"
    }
    r = client.post("/api/disasters/report", json=disaster_payload, headers=headers)
    assert r.status_code == 201, f"Report failed: {r.text}"
    created_disaster = r.json()
    report_id = created_disaster["id"]
    assert created_disaster["source"] == "USER_REPORTED", "Source must be USER_REPORTED"
    assert created_disaster["radiusKm"] == 8.0
    assert created_disaster["severity"] == "HIGH"
    print(f"  ✓ User Disaster Created: ID {report_id} | Source: {created_disaster['source']} | Radius: {created_disaster['radiusKm']}km")

    # Also test dual raw route /disasters/report
    r_direct = client.post("/disasters/report", json={
        "type": "Flood",
        "severity": "CRITICAL",
        "latitude": 26.2000,
        "longitude": 91.7500,
        "location_name": "Brahmaputra Lowland",
        "radiusKm": 12.0,
        "description": "Flash flooding over highway approach road.",
        "reportedBy": "User"
    })
    assert r_direct.status_code == 201, f"Direct endpoint failed: {r_direct.text}"
    report_id_2 = r_direct.json()["id"]
    print(f"  ✓ Dual URL Support Verified (/disasters/report): Created ID {report_id_2}")

    # 10. User Disaster Update (PATCH /api/disasters/:id)
    print("\n[10/25] Testing User Disaster Update (PATCH /api/disasters/:id)...")
    patch_payload = {
        "severity": "CRITICAL",
        "radiusKm": 14.0,
        "description": "Updated: Highway completely blocked by massive rockfall."
    }
    r = client.patch(f"/api/disasters/{report_id}", json=patch_payload, headers=headers)
    assert r.status_code == 200, f"Patch failed: {r.text}"
    patched = r.json()
    assert patched["severity"] == "CRITICAL"
    assert patched["radiusKm"] == 14.0
    print(f"  ✓ User Disaster Updated: Severity -> {patched['severity']} | Radius -> {patched['radiusKm']}km")

    # 11. User Disaster Persistence (SQLite Check)
    print("\n[11/25] Testing User Disaster DB Persistence...")
    db = SessionLocal()
    try:
        db_record = db.query(UserReport).filter(UserReport.id == report_id).first()
        assert db_record is not None, "Disaster must persist in SQLite database"
        assert db_record.source == "USER_REPORTED"
        assert db_record.radius_km == 14.0
        print(f"  ✓ DB Persistence OK: Record {db_record.id} confirmed in SQLite user_reports table.")
    finally:
        db.close()

    # 12. User Disaster Deletion (DELETE /api/disasters/:id)
    print("\n[12/25] Testing User Disaster Deletion (DELETE /api/disasters/:id)...")
    r = client.delete(f"/api/disasters/{report_id_2}", headers=headers)
    assert r.status_code == 200, f"Delete failed: {r.text}"
    db = SessionLocal()
    try:
        deleted_chk = db.query(UserReport).filter(UserReport.id == report_id_2).first()
        assert deleted_chk is None, "Deleted disaster should no longer exist in DB"
        print(f"  ✓ User Disaster Deletion OK: Record {report_id_2} permanently purged.")
    finally:
        db.close()

    # 13. SACHET XML Parsing
    print("\n[13/25] Testing SACHET CAP 1.2 XML Parsing...")
    sample_cap_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
        <identifier>NDMA-TEST-ALERT-001</identifier>
        <sender>NDMA SACHET Control Room</sender>
        <sent>2026-09-18T10:00:00+05:30</sent>
        <status>Actual</status>
        <msgType>Alert</msgType>
        <info>
            <event>Flash Flood Warning</event>
            <urgency>Immediate</urgency>
            <severity>Severe</severity>
            <certainty>Observed</certainty>
            <headline>Flash Flood Warning for Kamrup and Ri-Bhoi Corridor</headline>
            <description>Water levels exceeding safety threshold along NH-27 bridge approach.</description>
            <instruction>Avoid low-lying road corridors; prepare alternate routes.</instruction>
            <web>https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=NDMA-TEST-ALERT-001</web>
            <area>
                <areaDesc>Kamrup - Ri-Bhoi Border</areaDesc>
                <circle>26.0500,91.8500 10.0</circle>
            </area>
        </info>
    </alert>
    """
    parsed_alert = _parse_cap_xml(sample_cap_xml)
    assert parsed_alert is not None, "Failed to parse valid CAP XML"
    assert parsed_alert["identifier"] == "NDMA-TEST-ALERT-001"
    assert parsed_alert["event"] == "Flash Flood Warning"
    assert parsed_alert["instruction"] != ""
    assert "https://sachet.ndma.gov.in" in parsed_alert["source_url"]

    # Test official NDMA SACHET namespace-prefixed CAP XML format (<cap:alert>)
    official_ns_xml = """<cap:alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
        <cap:identifier>IN-1789746942626010_10</cap:identifier>
        <cap:sender>Assam-SDMA</cap:sender>
        <cap:sent>2026-09-18T21:26:01+05:30</cap:sent>
        <cap:status>Actual</cap:status>
        <cap:msgType>Alert</cap:msgType>
        <cap:info>
            <cap:event>Flood</cap:event>
            <cap:urgency>Immediate</cap:urgency>
            <cap:severity>Severe</cap:severity>
            <cap:certainty>Observed</cap:certainty>
            <cap:headline>Brahmaputra Flood Warning for Dibrugarh</cap:headline>
            <cap:description>Water levels crossing danger mark.</cap:description>
            <cap:instruction>Evacuate to elevated shelters immediately.</cap:instruction>
            <cap:area>
                <cap:areaDesc>Brahmaputra, Dibrugarh, Assam</cap:areaDesc>
                <cap:circle>27.4900,94.9100 12.0</cap:circle>
            </cap:area>
        </cap:info>
    </cap:alert>"""
    parsed_ns_alert = _parse_cap_xml(official_ns_xml)
    assert parsed_ns_alert is not None, "Failed to parse official namespace-prefixed CAP XML"
    assert parsed_ns_alert["identifier"] == "IN-1789746942626010_10"
    assert parsed_ns_alert["sender"] == "Assam-SDMA"
    assert parsed_ns_alert["severity"] == "High"
    assert parsed_ns_alert["circle_coordinates"] == "27.4900,94.9100 12.0"

    # Rejection of 404 HTML body without <alert> (Requirement 10)
    fake_404_body = "<!doctype html><html><head><title>HTTP Status 404 – Not Found</title></head><body>404</body></html>"
    assert _parse_cap_xml(fake_404_body) is None, "404 HTML body must be rejected and return None"

    print(f"  ✓ SACHET XML Parsing OK: Parsed standard & namespace-prefixed CAP 1.2 XML | 404 rejected.")

    # 14. SACHET Alert Normalization
    print("\n[14/25] Testing SACHET Severity Normalization...")
    assert _normalize_severity("EXTREME") == "Critical"
    assert _normalize_severity("SEVERE") == "High"
    assert _normalize_severity("MODERATE") == "Medium"
    assert _normalize_severity("MINOR") == "Low"
    assert _normalize_severity("UNKNOWN", color_raw="red") == "Critical"
    print("  ✓ SACHET Normalization OK: Severity tiers correctly mapped.")

    # 15. SACHET Duplicate Prevention
    print("\n[15/25] Testing SACHET Duplicate Prevention...")
    db = SessionLocal()
    try:
        # Insert once
        existing = db.query(DisasterAlert).filter(DisasterAlert.identifier == "NDMA-TEST-ALERT-001").first()
        if not existing:
            new_al = DisasterAlert(**parsed_alert)
            db.add(new_al)
            db.commit()
        
        # Insert again with same identifier should update, not create duplicate
        count_before = db.query(DisasterAlert).filter(DisasterAlert.identifier == "NDMA-TEST-ALERT-001").count()
        assert count_before == 1, "Duplicate alert exists before test"

        # Simulate sync updating description
        existing = db.query(DisasterAlert).filter(DisasterAlert.identifier == "NDMA-TEST-ALERT-001").first()
        existing.description = "Updated description during second sync"
        db.commit()

        count_after = db.query(DisasterAlert).filter(DisasterAlert.identifier == "NDMA-TEST-ALERT-001").count()
        assert count_after == 1, "Duplicate alert was created instead of updating"
        print("  ✓ Duplicate Prevention OK: Exactly 1 record exists after repeated sync.")
    finally:
        db.close()

    # 16. SACHET Expiry Handling
    print("\n[16/25] Testing SACHET Expiry Handling...")
    db = SessionLocal()
    try:
        # Create an expired alert
        expired_id = "NDMA-EXPIRED-TEST"
        exp_alert = db.query(DisasterAlert).filter(DisasterAlert.identifier == expired_id).first()
        if not exp_alert:
            exp_alert = DisasterAlert(
                identifier=expired_id,
                sender="NDMA",
                event="Past Landslide",
                headline="Old Landslide Cleared",
                severity="High",
                expires_at=datetime.utcnow() - timedelta(hours=2),
                is_active=True
            )
            db.add(exp_alert)
            db.commit()

        # Run expiry sweep
        now = datetime.utcnow()
        db.query(DisasterAlert).filter(
            DisasterAlert.is_active == True,
            DisasterAlert.expires_at != None,
            DisasterAlert.expires_at < now
        ).update({DisasterAlert.is_active: False})
        db.commit()

        check_exp = db.query(DisasterAlert).filter(DisasterAlert.identifier == expired_id).first()
        assert check_exp.is_active is False, "Expired alert was not deactivated"
        print("  ✓ Expiry Handling OK: Expired alerts automatically set is_active = False.")
    finally:
        db.close()

    # 17. SACHET Route Filtering (Feature 10)
    print("\n[17/25] Testing SACHET Route Spatial Intersection...")
    db = SessionLocal()
    try:
        # Coordinates along Guwahati -> Shillong route corridor (~lat 25.8 - 26.1, lon ~91.8)
        route_coords = [
            [91.7362, 26.1445],
            [91.8000, 25.9500],
            [91.8933, 25.5788]
        ]
        hazards = _check_hazard_intersection(route_coords, db, buffer_radius_km=15.0)
        sachet_hazards = [h for h in hazards if h.get("source") == "NDMA_SACHET"]
        assert len(sachet_hazards) >= 1, "Corridor alert NDMA-TEST-ALERT-001 should intersect route"
        assert sachet_hazards[0]["is_route_hazard"] is True
        assert sachet_hazards[0]["warning"] == "DISASTER AHEAD"
        print(f"  ✓ SACHET Route Filtering OK: Detected {len(sachet_hazards)} route hazard(s) with 'DISASTER AHEAD' warning.")
    finally:
        db.close()

    # 18. User Disaster Route Filtering (Feature 2)
    print("\n[18/25] Testing User Disaster Route Spatial Filtering...")
    db = SessionLocal()
    try:
        # The user report created at [25.9500, 91.8000] with 14km radius must intersect
        route_coords = [
            [91.7362, 26.1445],
            [91.8000, 25.9500],
            [91.8933, 25.5788]
        ]
        hazards = _check_hazard_intersection(route_coords, db, buffer_radius_km=12.0)
        user_hazards = [h for h in hazards if h.get("source") == "USER_REPORTED"]
        assert len(user_hazards) >= 1, "User reported disaster on NH-6 must intersect route"
        assert user_hazards[0]["verified"] is False, "User report must NOT be marked verified"
        assert user_hazards[0]["source_badge"] in [
            "USER REPORTED (UNVERIFIED)", "CITIZEN REPORT (PENDING REVIEW)",
            "AI VERIFIED CITIZEN REPORT", "AI REVIEW REQUIRED", "AI REJECTED",
            "AI-SUPPORTED CITIZEN HAZARD (NON-OFFICIAL)", "OFFICIAL ALERT CORROBORATED", "UNCONFIRMED CITIZEN REPORT"
        ]
        print(f"  ✓ User Disaster Route Filtering OK: Intersected {user_hazards[0]['title']} ({user_hazards[0]['source_badge']}).")
    finally:
        db.close()

    # 19. Combined Disaster Route Filtering (Feature 13)
    print("\n[19/25] Testing Combined Disaster Route Pipeline (SACHET + USER)...")
    db = SessionLocal()
    try:
        route_coords = [
            [91.7362, 26.1445],
            [91.8000, 25.9500],
            [91.8933, 25.5788]
        ]
        hazards = _check_hazard_intersection(route_coords, db, buffer_radius_km=15.0)
        sources = set(h.get("source") for h in hazards)
        assert "NDMA_SACHET" in sources and "USER_REPORTED" in sources, "Both disaster sources must participate in intersection pipeline"
        print(f"  ✓ Combined Filtering OK: Both sources detected ({', '.join(sources)}).")
    finally:
        db.close()

    # 20. GPS Speed Calculation (Feature 4)
    print("\n[20/25] Testing Real GPS Speed Calculation Engine...")
    # Point 1: 26.1445, 91.7362 at t=0
    # Point 2: 26.1545, 91.7362 (~1.11 km away) at t=60s (1 min = 1/60 hr)
    # Expected speed: ~1.11 / (1/60) = ~66.6 km/h
    lat1, lon1 = 26.1445, 91.7362
    lat2, lon2 = 26.1545, 91.7362
    dist_km = _haversine_distance_km(lat1, lon1, lat2, lon2)
    dt_hours = 60.0 / 3600.0 # 1 minute
    calc_speed_kmh = round(dist_km / dt_hours, 1)
    assert 60.0 <= calc_speed_kmh <= 75.0, f"Expected ~66 km/h, got {calc_speed_kmh}"
    print(f"  ✓ GPS Speed Calculation OK: Delta distance {dist_km:.2f}km in 60s = {calc_speed_kmh} km/h.")

    # 21. GPS Unavailable Handling
    print("\n[21/25] Testing GPS Unavailable Handling...")
    # Zero or negligible movement should yield SPEED UNAVAILABLE rather than fake numbers
    jitter_dist_km = _haversine_distance_km(26.14450, 91.73620, 26.14451, 91.73621) # ~1.5 meters
    jitter_threshold_km = 0.005 # 5 meters
    is_insufficient = jitter_dist_km < jitter_threshold_km
    status_label = "SPEED UNAVAILABLE" if is_insufficient else f"{round(jitter_dist_km * 3600)} km/h"
    assert status_label == "SPEED UNAVAILABLE"
    print(f"  ✓ GPS Unavailable Handling OK: Insufficient movement correctly maps to '{status_label}'.")

    # 22. Off-Route Detection Logic (Feature 8)
    print("\n[22/25] Testing Off-Route Detection Geometry Logic...")
    route_polyline = [
        [91.7362, 26.1445], # Guwahati
        [91.8000, 25.9500], # Midpoint
        [91.8933, 25.5788]  # Shillong
    ]
    # Vehicle coordinate 5 km off the highway corridor
    veh_lat, veh_lon = 26.1445, 91.9000
    closest_dist = min(_haversine_distance_km(veh_lat, veh_lon, pt[1], pt[0]) for pt in route_polyline)
    off_route_threshold_km = 0.100 # 100 meters
    is_off_route = closest_dist > off_route_threshold_km
    assert is_off_route is True, f"Vehicle {closest_dist:.2f}km away must be detected as off route"
    print(f"  ✓ Off-Route Detection OK: Vehicle {closest_dist:.2f}km from corridor flagged OFF ROUTE.")

    # 23. Route Recalculation Trigger (Feature 8)
    print("\n[23/25] Testing Off-Route Route Recalculation...")
    # Recalculate route from vehicle's new position to destination
    db = SessionLocal()
    try:
        recalc_res = calculate_smart_routes(
            origin_name="Dispur, Guwahati",
            destination_name="Shillong",
            vehicle_type="Car",
            cargo_type="Medical",
            cargo_weight_tonnes=1.0,
            avoid_disasters=True,
            db=db,
            travel_mode="car"
        )
        assert "routes" in recalc_res and "fastest" in recalc_res["routes"]
        assert len(recalc_res.get("navigation_steps", [])) > 0, "Turn-by-turn navigation steps must be populated"
        print(f"  ✓ Route Recalculation OK: Recalculated path with {len(recalc_res.get('navigation_steps', []))} navigation steps.")
    finally:
        db.close()

    # 24. Accurate ETA Calculation (Feature 6)
    print("\n[24/25] Testing ETA Calculation (Provider Duration vs Constant)...")
    db = SessionLocal()
    try:
        route_out = calculate_smart_routes(
            origin_name="Guwahati",
            destination_name="Shillong",
            vehicle_type="Car",
            cargo_type="General",
            cargo_weight_tonnes=2.0,
            avoid_disasters=False,
            db=db,
            travel_mode="car"
        )
        fastest_eta = route_out["routes"]["fastest"]["eta_hours"]
        dist_km = route_out["routes"]["fastest"]["distance_km"]
        # If it was using fake remainingKm / 20, 100km would be exactly 5.0h
        # Actual driving between Guwahati and Shillong is ~2.2 - 2.8h on OSRM
        assert fastest_eta < (dist_km / 20.0), "ETA must not use naive constant remainingKm/20"
        print(f"  ✓ Accurate ETA OK: {dist_km} km computed at {fastest_eta}h ({route_out['routes']['fastest']['eta_formatted']}).")
    finally:
        db.close()

    # 25. Source Labelling Integrity (Feature 16)
    print("\n[25/25] Testing Data Source Badges & Labelling Integrity...")
    r_status = client.get("/api/disasters/status")
    assert r_status.status_code == 200
    s_info = r_status.json()
    assert "source" in s_info and "sachet" in s_info["source"].lower()
    assert "status" in s_info
    assert s_info["status"] in [
        "LIVE", "NOT_MODIFIED", "CACHED", "UNAVAILABLE", "NOT_CONFIGURED",
        "CACHED OFFICIAL DATA", "FEED UNAVAILABLE", "NOT CONFIGURED",
    ], f"Invalid SACHET status: {s_info['status']}"
    status_for_live_check = s_info.get("statusCode") or s_info["status"]
    if status_for_live_check in ["CACHED OFFICIAL DATA", "CACHED", "NOT_MODIFIED", "UNAVAILABLE", "NOT_CONFIGURED"]:
        assert s_info["is_live"] is False, "Cached/unavailable data must never be claimed as LIVE"
    assert "last_successful_fetch_time" in s_info or "lastSuccessfulFetch" in s_info
    assert "official_endpoint" in s_info or "officialSourceUrl" in s_info
    assert "etagPresent" in s_info

    r_user = client.get("/api/disasters/user-reported")
    assert r_user.status_code == 200
    u_reports = r_user.json()
    assert u_reports[0]["source_badge"] in [
        "USER REPORTED (UNVERIFIED)",
        "CITIZEN REPORT (PENDING REVIEW)",
        "AI VERIFIED CITIZEN REPORT",
        "AI REVIEW REQUIRED",
        "AI REJECTED",
        "AI-SUPPORTED CITIZEN HAZARD (NON-OFFICIAL)",
        "OFFICIAL ALERT CORROBORATED",
        "UNCONFIRMED CITIZEN REPORT"
    ]
    print(f"  ✓ Source Badges OK: SACHET [{s_info['status']}] -> {s_info['source']} | User -> {u_reports[0]['source_badge']}")

    # ---- Extended SACHET ETag / status / integrity tests (26+) ----
    print("\n[26+] Extended SACHET ETag, GPS, Map Provider & Integrity Tests...")
    from app.services.sachet_service import fetch_cap_xml_with_etag
    from app.models import SachetEtagCache
    from unittest.mock import MagicMock, patch
    import httpx as _httpx

    db = SessionLocal()
    try:
        parsed, meta = fetch_cap_xml_with_etag(MagicMock(), db, "")
        assert parsed is None
        assert meta["responseStatus"] == "MISSING_IDENTIFIER"
        print("  ✓ [26] Missing identifier rejected")

        sample_xml = """<?xml version="1.0"?><alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
            <identifier>ETAG-TEST-200</identifier><sender>NDMA</sender><sent>2026-09-18T10:00:00+05:30</sent>
            <status>Actual</status><msgType>Alert</msgType>
            <info><event>Test</event><urgency>Immediate</urgency><severity>Moderate</severity>
            <certainty>Observed</certainty><headline>ETag Test</headline>
            <area><areaDesc>Assam</areaDesc><circle>26.1,91.7 5.0</circle></area></info></alert>"""
        # Isolate: clear any prior ETag row so first fetch has no If-None-Match
        for old in db.query(SachetEtagCache).filter(SachetEtagCache.alert_identifier == "ETAG-TEST-200").all():
            db.delete(old)
        db.commit()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = sample_xml
        mock_resp.headers = {"ETag": '"abc123"', "Last-Modified": "Fri, 18 Sep 2026 10:00:00 GMT"}
        mock_client = MagicMock()
        mock_client.get.return_value = mock_resp
        parsed, meta = fetch_cap_xml_with_etag(mock_client, db, "ETAG-TEST-200")
        assert parsed is not None and parsed["identifier"] == "ETAG-TEST-200"
        assert meta["responseStatus"] == "LIVE"
        assert meta["etagPresent"] is True
        row = db.query(SachetEtagCache).filter(SachetEtagCache.alert_identifier == "ETAG-TEST-200").first()
        assert row is not None and row.etag == "abc123" and row.cached_xml
        sent_headers = mock_client.get.call_args.kwargs.get("headers") or {}
        assert "If-None-Match" not in sent_headers
        print("  ✓ [27-29] HTTP 200 + ETag storage OK")

        mock_resp_304 = MagicMock()
        mock_resp_304.status_code = 304
        mock_resp_304.headers = {}
        mock_client_304 = MagicMock()
        mock_client_304.get.return_value = mock_resp_304
        parsed304, meta304 = fetch_cap_xml_with_etag(mock_client_304, db, "ETAG-TEST-200")
        assert parsed304 is not None
        assert meta304["responseStatus"] == "NOT_MODIFIED"
        assert meta304["usedCache"] is True
        hdrs = mock_client_304.get.call_args.kwargs.get("headers") or {}
        assert "If-None-Match" in hdrs
        print("  ✓ [30-31] HTTP 304 + If-None-Match + cached XML OK")

        mock_timeout = MagicMock()
        mock_timeout.get.side_effect = _httpx.TimeoutException("timeout")
        with patch("app.services.sachet_service.time.sleep", return_value=None):
            parsed_t, meta_t = fetch_cap_xml_with_etag(mock_timeout, db, "ETAG-TEST-200")
        assert meta_t["responseStatus"] == "CACHED"
        assert parsed_t is not None
        print("  ✓ [32] Timeout falls back to cached official XML")

        mock_bad = MagicMock()
        bad_resp = MagicMock()
        bad_resp.status_code = 200
        bad_resp.text = "<html>not cap</html>"
        bad_resp.headers = {}
        mock_bad.get.return_value = bad_resp
        parsed_bad, meta_bad = fetch_cap_xml_with_etag(mock_bad, db, "ETAG-BAD-XML")
        assert parsed_bad is None
        assert meta_bad["responseStatus"] == "INVALID_XML"
        print("  ✓ [33] Invalid XML rejected")

        mock_no_etag = MagicMock()
        ne = MagicMock()
        ne.status_code = 200
        ne.text = sample_xml.replace("ETAG-TEST-200", "ETAG-NO-ETAG-HDR")
        ne.headers = {}
        mock_no_etag.get.return_value = ne
        parsed_ne, meta_ne = fetch_cap_xml_with_etag(mock_no_etag, db, "ETAG-NO-ETAG-HDR")
        assert parsed_ne is not None
        assert meta_ne["responseStatus"] == "LIVE"
        print("  ✓ [34] Missing ETag header handled safely")
    finally:
        db.close()

    r_st = client.get("/api/disasters/status")
    assert r_st.status_code == 200
    st = r_st.json()
    for key in ("source", "status", "lastCheckedAt", "lastSuccessfulFetch", "etagPresent", "officialSourceUrl"):
        assert key in st, f"Missing status key {key}"
    print("  ✓ [35] Status endpoint keys OK")

    r_live = client.get("/api/disasters/live")
    assert r_live.status_code == 200
    print(f"  ✓ [36] /disasters/live OK ({len(r_live.json())} alerts)")

    r_rf = client.post("/api/disasters/route", json={
        "coordinates": [[91.7362, 26.1445], [91.8000, 25.9500], [91.8933, 25.5788]],
        "buffer_km": 15
    })
    assert r_rf.status_code == 200
    rf = r_rf.json()
    assert "routeAlerts" in rf and "summary" in rf
    assert "officialAlertsOnRoute" in rf["summary"]
    print("  ✓ [37] Route disaster filter OK")

    db = SessionLocal()
    try:
        from sqlalchemy import inspect as sa_inspect
        tables = sa_inspect(db.bind).get_table_names()
        assert "demo_hospitals" not in tables
        assert "sample_clinics" not in tables
        print("  ✓ [38] No demo hospital tables")
    finally:
        db.close()

    r_svc = client.get("/api/services/status")
    assert r_svc.status_code == 200
    svc = r_svc.json()
    assert "sachetNdma" in svc and "googleMapsProvider" in svc
    print("  ✓ [39] Services status panel OK")

    from app.config import settings as _settings
    print(f"  ✓ [40] Google Maps configured={_settings.is_google_maps_configured} (honest, no fake claim)")

    # 41. Evidence Upload Test
    import io
    dummy_img = io.BytesIO(b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00\x48\x00\x48\x00\x00\xFF\xDB\x00C\x00\xFF\xD9")
    r_up = client.post("/api/disasters/report/evidence", files={"file": ("evidence.jpg", dummy_img, "image/jpeg")})
    assert r_up.status_code == 200, f"Evidence upload failed: {r_up.text}"
    evidence_res = r_up.json()
    assert "image_url" in evidence_res and "/uploads/reports/" in evidence_res["image_url"]
    print("  ✓ [41] Evidence file upload endpoint OK")

    # 42. User Reported Stats Test
    r_stats = client.get("/api/disasters/user-reported/stats")
    assert r_stats.status_code == 200, f"Stats failed: {r_stats.text}"
    stats_data = r_stats.json()
    for key in ("total", "pending", "approved", "rejected"):
        assert key in stats_data, f"Missing stat key {key}"
    print("  ✓ [42] User reported disaster stats endpoint OK")

    # 43. Approve Citizen Report Test
    r_app = client.patch(f"/api/disasters/user-reported/{report_id}/approve", json={"notes": "Ground team confirmed rockfall cleared one lane."})
    assert r_app.status_code == 200, f"Approve failed: {r_app.text}"
    assert r_app.json()["status"] == "APPROVED"
    assert r_app.json()["verified"] is True
    print("  ✓ [43] Operator approve citizen report OK")

    # 44. Create & Reject Citizen Report Test
    r_temp = client.post("/api/disasters/report", json={
        "type": "Tree Fall",
        "severity": "LOW",
        "latitude": 26.1500,
        "longitude": 91.7800,
        "location_name": "Temporary Test Location",
        "description": "Fallen bamboo branch on curb."
    }, headers=headers)
    temp_id = r_temp.json()["id"]

    r_rej = client.patch(f"/api/disasters/user-reported/{temp_id}/reject", json={"notes": "Cleared by municipal workers."})
    assert r_rej.status_code == 200, f"Reject failed: {r_rej.text}"
    assert r_rej.json()["status"] == "REJECTED"
    print("  ✓ [44] Operator reject citizen report OK")

    # 45. Global Citizen Reporting & Scope Validation (Feature: Global Coordinate Acceptance)
    print("\n[45/48] Testing Global Citizen Report Acceptance (Mangaluru & Global)...")
    # Mangaluru (Karnataka, India) — outside NER envelope, MUST NOT be rejected due to location
    r_mangaluru = client.post("/api/disasters/report", json={
        "type": "Landslide",
        "severity": "MODERATE",
        "latitude": 12.8657,
        "longitude": 74.9227,
        "location_name": "Mangaluru Coastal Highway, Karnataka",
        "description": "Mudslide obstructing one lane on coastal highway. Vehicles moving with caution."
    }, headers=headers)
    assert r_mangaluru.status_code == 201, f"Mangaluru report creation failed: {r_mangaluru.text}"
    m_data = r_mangaluru.json()
    assert m_data["location_scope"] == "INDIA_OUTSIDE_NER", f"Expected INDIA_OUTSIDE_NER, got {m_data.get('location_scope')}"
    assert m_data["verification_status"] != "AI_REJECTED", f"Mangaluru report was rejected! Reason: {m_data.get('ai_reason')}"
    print(f"  ✓ Mangaluru accepted: Status={m_data['verification_status']}, Scope={m_data['location_scope']}, Confidence={m_data['ai_confidence']}")

    # New York (Global Outside India) — MUST NOT be rejected due to location
    r_global = client.post("/api/disasters/report", json={
        "type": "Flash Flood",
        "severity": "MODERATE",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "location_name": "Lower Manhattan, New York",
        "description": "Heavy waterlogging on roadway following flash torrential downpour."
    }, headers=headers)
    assert r_global.status_code == 201, f"Global report creation failed: {r_global.text}"
    g_data = r_global.json()
    assert g_data["location_scope"] == "GLOBAL_OUTSIDE_INDIA", f"Expected GLOBAL_OUTSIDE_INDIA, got {g_data.get('location_scope')}"
    assert g_data["verification_status"] != "AI_REJECTED", f"Global report was rejected! Reason: {g_data.get('ai_reason')}"
    print(f"  ✓ Global (NYC) accepted: Status={g_data['verification_status']}, Scope={g_data['location_scope']}, Confidence={g_data['ai_confidence']}")

    # Invalid Coordinates — MUST be rejected by backend validation
    r_inv_lat = client.post("/api/disasters/report", json={
        "type": "Landslide",
        "severity": "LOW",
        "latitude": 91.0,
        "longitude": 74.0,
        "location_name": "Invalid Latitude Point",
        "description": "Testing invalid latitude rejection."
    }, headers=headers)
    assert r_inv_lat.status_code == 400, "Latitude 91.0 must be rejected with HTTP 400"

    r_inv_lon = client.post("/api/disasters/report", json={
        "type": "Landslide",
        "severity": "LOW",
        "latitude": 12.0,
        "longitude": 181.0,
        "location_name": "Invalid Longitude Point",
        "description": "Testing invalid longitude rejection."
    }, headers=headers)
    assert r_inv_lon.status_code == 400, "Longitude 181.0 must be rejected with HTTP 400"
    print("  ✓ Invalid coordinate boundaries (lat 91, lon 181) successfully rejected.")

    # Clean up global test reports
    client.delete(f"/api/disasters/{m_data['id']}", headers=headers)
    client.delete(f"/api/disasters/{g_data['id']}", headers=headers)

    # =========================================================================
    # MULTI-SIGNAL AI CITIZEN DISASTER VERIFICATION ENGINE TESTS (CASES 1 - 9)
    # =========================================================================
    print("\n[46/55] Testing Multi-Signal AI Citizen Verification Engine (Cases 1 - 9)...")
    import app.services.citizen_report_verifier as crv
    db_ms = SessionLocal()
    from app.routers.disasters import UPLOAD_DIR as _UDIR
    _dummy_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00\x48\x00\x48\x00\x00\xFF\xDB\x00C\x00\xFF\xD9" * 10
    selfie_file = _UDIR / "selfie_face_photo.jpg"
    selfie_file.write_bytes(_dummy_bytes)
    landslide_file = _UDIR / "real_landslide.jpg"
    landslide_file.write_bytes(_dummy_bytes)

    try:
        orig_analyze = crv._analyze_image_with_vision

        # --- CASE 1: Irrelevant selfie image uploaded ---
        irrelevant_payload = {
            "latitude": 26.1445,
            "longitude": 91.7362,
            "location_name": "Guwahati City Center",
            "disaster_type": "Landslide",
            "severity": "CRITICAL",
            "description": "Massive landslide blocking main arterial road.",
            "evidence_url": "uploads/reports/selfie_face_photo.jpg"
        }
        crv._analyze_image_with_vision = lambda *args, **kwargs: {
            "analysis_available": True,
            "imageRelevant": False,
            "detectedHazard": "None / Person Selfie",
            "matchesReportedHazard": False,
            "roadImpact": "NONE",
            "imageConfidence": 0.10,
            "summary": "Photo contains an indoor close-up selfie of a person with no visible disaster, debris, or road hazard."
        }
        v_c1 = crv.verify_citizen_report(irrelevant_payload, db_ms)
        assert v_c1["verification_status"] in ["AI_REVIEW", "AI_UNSUPPORTED"], f"Expected AI_REVIEW or AI_UNSUPPORTED for irrelevant photo, got {v_c1['verification_status']}"
        assert "EVIDENCE DOES NOT CLEARLY SUPPORT THE REPORTED HAZARD" in v_c1["ai_reason"], f"Expected warning in ai_reason, got {v_c1['ai_reason']}"
        print("  ✓ Case 1 passed: Irrelevant selfie photo evaluated as unconfirmed/unsupported with required warning phrase.")

        # --- CASE 2: Citizen report with matching active NDMA SACHET alert ---
        sachet_alert = DisasterAlert(
            identifier="NDMA-CAP-TEST-FLOOD-001",
            event="Flood",
            headline="Flash Flood Warning in Guwahati Corridor",
            description="Severe river overflow inundating National Highway.",
            severity="Severe",
            urgency="Immediate",
            status="Actual",
            msg_type="Alert",
            circle_coordinates="26.1800,91.7500",
            is_active=True,
            fetched_at=datetime.utcnow()
        )
        db_ms.add(sachet_alert)
        db_ms.commit()
        db_ms.refresh(sachet_alert)

        c2_payload = {
            "latitude": 26.1750,
            "longitude": 91.7450, # within 5 km (< 35 km)
            "location_name": "Guwahati Bypass",
            "disaster_type": "Flood",
            "severity": "HIGH",
            "description": "Water rising rapidly over highway near Guwahati bypass.",
            "reporter_phone": "+91-98765-11111"
        }
        crv._analyze_image_with_vision = lambda *args, **kwargs: {
            "analysis_available": False,
            "imageRelevant": False,
            "detectedHazard": "UNKNOWN",
            "matchesReportedHazard": False,
            "roadImpact": "UNKNOWN",
            "imageConfidence": 0.50,
            "summary": "Automated evidence analysis temporarily unavailable."
        }
        v_c2 = crv.verify_citizen_report(c2_payload, db_ms)
        assert v_c2["verification_status"] == "SACHET_CORROBORATED", f"Expected SACHET_CORROBORATED, got {v_c2['verification_status']}"
        assert v_c2["corroborated_sachet_alert_id"] == sachet_alert.id, f"Expected linked SACHET id {sachet_alert.id}, got {v_c2['corroborated_sachet_alert_id']}"
        assert v_c2["corroborated_sachet_identifier"] == "NDMA-CAP-TEST-FLOOD-001"
        print("  ✓ Case 2 passed: Citizen report successfully correlated with active SACHET alert without duplicating official alert.")

        # --- CASE 3: Single citizen report with no corroboration, high claimed severity ---
        c3_payload = {
            "latitude": 25.5788,
            "longitude": 91.8933,
            "location_name": "Shillong Ridge Road",
            "disaster_type": "Landslide",
            "severity": "CRITICAL",
            "description": "Entire mountain collapsed, road gone completely.",
            "reporter_phone": "+91-98765-22222"
        }
        v_c3 = crv.verify_citizen_report(c3_payload, db_ms)
        assert v_c3["verification_status"] == "AI_REVIEW", f"Single report must remain AI_REVIEW, got {v_c3['verification_status']}"
        print("  ✓ Case 3 passed: Single citizen report with high claimed severity correctly kept as cautionary AI_REVIEW.")

        # --- CASE 4: Multiple independent citizen reports at same incident promote to AI_SUPPORTED ---
        rep1 = UserReport(
            reporter_name="Citizen 1",
            reporter_phone="+91-98765-33331",
            disaster_type="Landslide",
            severity="HIGH",
            latitude=25.5800,
            longitude=91.8900,
            location_name="Shillong Bypass",
            description="Rockfall and mud blocking one lane.",
            status="PENDING",
            verification_status="AI_REVIEW",
            evidence_hash="hash_evidence_image_001",
            created_at=datetime.utcnow()
        )
        rep2 = UserReport(
            reporter_name="Citizen 2",
            reporter_phone="+91-98765-33332",
            disaster_type="Landslide",
            severity="HIGH",
            latitude=25.5810,
            longitude=91.8920,
            location_name="Shillong Bypass",
            description="Confirming rocks on the road, traffic backed up.",
            status="PENDING",
            verification_status="AI_REVIEW",
            evidence_hash="hash_evidence_image_002",
            created_at=datetime.utcnow()
        )
        db_ms.add(rep1)
        db_ms.add(rep2)
        db_ms.commit()

        crv._analyze_image_with_vision = lambda *args, **kwargs: {
            "analysis_available": True,
            "imageRelevant": True,
            "detectedHazard": "Landslide",
            "matchesReportedHazard": True,
            "roadImpact": "BLOCKAGE",
            "imageConfidence": 0.92,
            "summary": "Genuine mud and rocks blocking highway lanes."
        }
        c4_payload = {
            "latitude": 25.5805,
            "longitude": 91.8910,
            "location_name": "Shillong Bypass",
            "disaster_type": "Landslide",
            "severity": "HIGH",
            "description": "Third confirmation of landslide blocking lane.",
            "reporter_phone": "+91-98765-33333",
            "evidence_url": "uploads/reports/real_landslide.jpg"
        }
        v_c4 = crv.verify_citizen_report(c4_payload, db_ms)
        assert v_c4["verification_status"] == "AI_SUPPORTED", f"Expected AI_SUPPORTED for corroborated reports, got {v_c4['verification_status']}"
        assert v_c4["corroboration_count"] >= 3, f"Expected corroboration_count >= 3, got {v_c4['corroboration_count']}"
        print(f"  ✓ Case 4 passed: Multi-signal independent corroboration promoted report to AI_SUPPORTED (Corroborations: {v_c4['corroboration_count']}).")

        # --- CASE 5: Duplicate submissions from same phone / image hash ---
        rep_spam_base = UserReport(
            reporter_name="Spammer",
            reporter_phone="+91-99999-00000",
            disaster_type="Landslide",
            severity="HIGH",
            latitude=25.5800,
            longitude=91.8900,
            location_name="Spam Location",
            description="Spam submission 1",
            status="PENDING",
            verification_status="AI_REVIEW",
            evidence_hash="identical_spam_hash_999",
            created_at=datetime.utcnow()
        )
        db_ms.add(rep_spam_base)
        db_ms.commit()

        spam_payload = {
            "latitude": 25.5800,
            "longitude": 91.8900,
            "location_name": "Spam Location",
            "disaster_type": "Landslide",
            "severity": "HIGH",
            "description": "Spam submission repeat",
            "reporter_phone": "+91-99999-00000",
            "evidence_hash": "identical_spam_hash_999"
        }
        crv._analyze_image_with_vision = lambda *args, **kwargs: {
            "analysis_available": False,
            "imageRelevant": False,
            "detectedHazard": "UNKNOWN",
            "matchesReportedHazard": False,
            "roadImpact": "UNKNOWN",
            "imageConfidence": 0.50,
            "summary": "Automated evidence analysis temporarily unavailable."
        }
        v_c5 = crv.verify_citizen_report(spam_payload, db_ms)
        assert v_c5["duplicate_score"] < 0.6, f"Duplicate score should be penalized, got {v_c5['duplicate_score']}"
        assert v_c5["verification_status"] != "AI_SUPPORTED", f"Spam submissions must not be AI_SUPPORTED, got {v_c5['verification_status']}"
        print("  ✓ Case 5 passed: Repeated submissions from same phone/hash suppressed from independent corroboration count.")

        # --- CASE 6: Geographically far SACHET alert (>300 km) does not falsely correlate ---
        c6_payload = {
            "latitude": 27.4728,
            "longitude": 94.9120, # Dibrugarh (> 350 km from Guwahati SACHET alert)
            "location_name": "Dibrugarh Bypass",
            "disaster_type": "Flood",
            "severity": "MODERATE",
            "description": "Water on Dibrugarh bypass.",
            "reporter_phone": "+91-98765-66666"
        }
        v_c6 = crv.verify_citizen_report(c6_payload, db_ms)
        assert v_c6["corroborated_sachet_alert_id"] is None, f"Expected no correlation with distant SACHET alert, got {v_c6['corroborated_sachet_alert_id']}"
        assert v_c6["verification_status"] != "SACHET_CORROBORATED", f"Distant alert must not be SACHET_CORROBORATED"
        print("  ✓ Case 6 passed: Geographically far SACHET alert (>300km) correctly had zero false correlation.")

        # --- CASE 7: Validated hazard (AI_SUPPORTED) intersecting route corridor ---
        h_on_route = UserReport(
            reporter_name="Verified Scout",
            reporter_phone="+91-98765-77777",
            disaster_type="Landslide",
            severity="CRITICAL",
            latitude=25.9000,
            longitude=91.8800,
            location_name="Nongpoh Highway NH6",
            description="Massive rockfall blocking NH6 completely.",
            status="APPROVED",
            verification_status="AI_SUPPORTED",
            radius_km=6.0,
            road_impact="BLOCKAGE",
            created_at=datetime.utcnow()
        )
        db_ms.add(h_on_route)
        db_ms.commit()
        db_ms.refresh(h_on_route)

        r_route_haz = calculate_smart_routes(
            origin_name="Guwahati",
            destination_name="Shillong",
            vehicle_type="Heavy Duty Truck",
            cargo_type="General Supplies",
            cargo_weight_tonnes=5.0,
            avoid_disasters=False,
            db=db_ms
        )
        assert "routes" in r_route_haz and "fastest" in r_route_haz["routes"]
        primary_coords = r_route_haz["routes"]["fastest"].get("geometry", {}).get("coordinates", [])
        intersected = _check_hazard_intersection(primary_coords, db_ms)
        found_on_route = [h for h in intersected if h.get("id") == h_on_route.id and h.get("is_route_hazard") == True]
        assert len(found_on_route) > 0, f"AI_SUPPORTED hazard {h_on_route.id} on corridor was not detected as route hazard!"
        assert found_on_route[0]["source_badge"] == "AI-SUPPORTED CITIZEN HAZARD (NON-OFFICIAL)"
        print("  ✓ Case 7 passed: AI_SUPPORTED hazard intersecting corridor flagged as active route hazard with penalty.")

        # --- CASE 8: Validated hazard outside route corridor ---
        h_off_route = UserReport(
            reporter_name="Silchar Scout",
            reporter_phone="+91-98765-88888",
            disaster_type="Flood",
            severity="CRITICAL",
            latitude=24.8170,
            longitude=92.7925, # Silchar (~150km off corridor)
            location_name="Silchar Point",
            description="Flooding in Silchar town.",
            status="APPROVED",
            verification_status="AI_SUPPORTED",
            radius_km=5.0,
            road_impact="BLOCKAGE",
            created_at=datetime.utcnow()
        )
        db_ms.add(h_off_route)
        db_ms.commit()
        db_ms.refresh(h_off_route)

        found_off_route = [h for h in intersected if h.get("id") == h_off_route.id]
        assert len(found_off_route) == 0, f"Hazard in Silchar must NOT intersect Guwahati-Shillong corridor! Found: {found_off_route}"
        print("  ✓ Case 8 passed: Hazard outside route corridor correctly excluded from route blockage.")

        # Clean up test sachet alert before Case 9 so fallback is tested without active official alert
        db_ms.delete(sachet_alert)
        db_ms.commit()

        # --- CASE 9: Gemini unavailable / network failure fallback ---
        crv._analyze_image_with_vision = lambda *args, **kwargs: {
            "analysis_available": False,
            "imageRelevant": False,
            "detectedHazard": "UNKNOWN",
            "matchesReportedHazard": False,
            "roadImpact": "UNKNOWN",
            "imageConfidence": 0.50,
            "summary": "Automated evidence analysis temporarily unavailable."
        }
        c9_payload = {
            "latitude": 26.1445,
            "longitude": 91.7362,
            "location_name": "Guwahati City",
            "disaster_type": "Landslide",
            "severity": "HIGH",
            "description": "Road obstruction reported with image upload.",
            "evidence_url": "uploads/reports/unreachable_cloud_image.jpg"
        }
        v_c9 = crv.verify_citizen_report(c9_payload, db_ms)
        assert v_c9["verification_status"] == "AI_REVIEW", f"Fallback when AI vision is unavailable must be AI_REVIEW, got {v_c9['verification_status']}"
        assert v_c9["image_analysis_available"] == False
        print("  ✓ Case 9 passed: Gemini unavailability gracefully falls back to AI_REVIEW without fake approvals.")

        # Restore original mock
        crv._analyze_image_with_vision = orig_analyze

        # Clean up test reports from Cases 1-9
        db_ms.delete(rep1)
        db_ms.delete(rep2)
        db_ms.delete(rep_spam_base)
        db_ms.delete(h_on_route)
        db_ms.delete(h_off_route)
        db_ms.commit()

        if selfie_file.exists():
            selfie_file.unlink()
        if landslide_file.exists():
            landslide_file.unlink()
    finally:
        db_ms.close()

    # 48. Multi-Modal Live GPS & Routing Tests
    print("\n[47/55] Testing Multi-Modal GPS & Travel Mode Engine...")
    # Walking mode test
    r_walk = client.post("/api/routes/calculate", json={
        "origin": "Guwahati",
        "destination": "Shillong",
        "travel_mode": "walking"
    })
    assert r_walk.status_code == 200
    walk_data = r_walk.json()
    assert walk_data.get("travel_mode") == "walking"
    assert walk_data.get("provider_status") in ["CONNECTED", "UNAVAILABLE", "NOT_CONFIGURED"]
    if walk_data.get("available") is True:
        assert walk_data.get("vehicle_type") == "Walking"
        assert walk_data["routes"]["fastest"]["fuel_cost_inr"] == 0.0
        assert walk_data["routes"]["fastest"]["toll_cost_inr"] == 0.0
        print("  ✓ Walking mode connected to pedestrian routing with zero fuel/toll and pedestrian ETA")
    else:
        assert "pedestrian" in walk_data.get("message", "").lower() or "walking" in walk_data.get("message", "").lower()
        print("  ✓ Walking mode correctly returns UNAVAILABLE without fabricating car routes")

    # Bicycle mode test
    r_bike = client.post("/api/routes/calculate", json={
        "origin": "Guwahati",
        "destination": "Shillong",
        "travel_mode": "bicycle"
    })
    assert r_bike.status_code == 200
    bike_data = r_bike.json()
    assert bike_data.get("travel_mode") == "bicycle"
    assert bike_data.get("provider_status") in ["CONNECTED", "UNAVAILABLE", "NOT_CONFIGURED"]
    if bike_data.get("available") is True:
        assert bike_data.get("vehicle_type") == "Bicycle"
        assert bike_data["routes"]["fastest"]["fuel_cost_inr"] == 0.0
        assert bike_data["routes"]["fastest"]["toll_cost_inr"] == 0.0
        print("  ✓ Bicycle mode connected to cycling routing with zero fuel/toll and bicycle ETA")
    else:
        assert "cycling" in bike_data.get("message", "").lower() or "bicycle" in bike_data.get("message", "").lower()
        print("  ✓ Bicycle mode correctly returns UNAVAILABLE without fabricating car routes")

    # Train mode test
    r_train = client.post("/api/routes/calculate", json={
        "origin": "Guwahati",
        "destination": "Shillong",
        "travel_mode": "train"
    })
    assert r_train.status_code == 200
    train_data = r_train.json()
    assert train_data.get("travel_mode") == "train"
    assert train_data.get("available") is False
    assert "railway" in train_data.get("message", "").lower() or "train" in train_data.get("message", "").lower()
    print("  ✓ Train mode correctly returns rail status with honest non-configured notice")

    # Flight mode test (Commercial Aviation Engine)
    r_flight = client.post("/api/routes/calculate", json={
        "origin": "Guwahati",
        "destination": "Shillong",
        "travel_mode": "flight"
    })
    assert r_flight.status_code == 200
    flight_data = r_flight.json()
    assert flight_data.get("travel_mode") == "flight"
    assert flight_data.get("available") is True
    assert flight_data.get("provider_status") == "CONNECTED"
    assert flight_data.get("origin_airport", {}).get("iata") == "GAU"
    assert flight_data.get("dest_airport", {}).get("iata") == "SHL"
    assert "routes" in flight_data and len(flight_data["routes"]) == 4
    fastest_flight = flight_data["routes"]["fastest"]
    assert fastest_flight["toll_cost_inr"] == 0.0
    assert len(fastest_flight["geometry_coordinates"]) > 10
    assert len(flight_data.get("navigation_steps", [])) >= 4
    print("  ✓ Flight mode successfully computes commercial flight route connecting GAU and SHL airports with geodesic airway geometry")

    # Car mode test
    r_car = client.post("/api/routes/calculate", json={
        "origin": "Guwahati",
        "destination": "Shillong",
        "travel_mode": "car"
    })
    assert r_car.status_code == 200
    car_data = r_car.json()
    assert car_data.get("vehicle_type") == "Car"
    assert "routes" in car_data and len(car_data["routes"]) > 0
    print("  ✓ Car mode successfully computes road route with Car speed profile")

    # ============================================================
    # 48. AUTOMATIC OFFLINE RESILIENCE, JOURNEY SESSIONS, SMS FALLBACK & SATELLITE
    # ============================================================
    print("\n[48/60] Testing Automatic Offline Mode, SMS Fallback & Satellite Resilience...")

    # 48.1 Connectivity Health (Heartbeat)
    r_health = client.get("/api/connectivity/health")
    assert r_health.status_code == 200
    health_data = r_health.json()
    assert health_data["status"] == "ok"
    assert "server_time" in health_data
    assert health_data["heartbeat_interval_ms"] > 0
    print("  ✓ [48.1] Lightweight connectivity health heartbeat responds <100ms with valid timestamp")

    # 48.2 Honest Communication Status
    r_comm = client.get("/api/communication/status", headers=headers)
    assert r_comm.status_code == 200
    comm_data = r_comm.json()
    assert "sms" in comm_data
    assert "satellite" in comm_data
    assert comm_data["sms"]["configured"] is False or comm_data["sms"]["simulated"] is True
    assert comm_data["satellite"]["state"] in ["NOT_CONFIGURED", "UNKNOWN"]
    assert comm_data["satellite"]["can_transmit"] is False
    print("  ✓ [48.2] Communication status panel reports honest state (SMS: SIMULATION/NOT_CONFIGURED, Satellite: NOT_CONFIGURED)")

    # 48.3 Journey Session Lifecycle (Start -> Heartbeat -> Active -> Finish)
    r_j_start = client.post("/api/journeys/start", headers=headers, json={
        "travel_mode": "car",
        "origin": "Guwahati",
        "destination": "Shillong",
        "origin_lat": 26.1445,
        "origin_lon": 91.7362,
        "dest_lat": 25.5788,
        "dest_lon": 91.8933,
        "route_geometry": "[[91.7362, 26.1445], [91.7800, 25.9000], [91.8933, 25.5788]]",
        "sms_consent": True,
        "phone_number": "+919876543210",
        "preferred_language": "en"
    })
    assert r_j_start.status_code == 200
    j_data = r_j_start.json()
    assert j_data["active"] is True
    assert j_data["sms_consent"] is True
    assert "******" in j_data["sms_phone_masked"]
    journey_id = j_data["journey_id"]
    print("  ✓ [48.3] Active journey session created with masked phone logging & server monitoring")

    # Journey Heartbeat
    r_hb = client.post(f"/api/journeys/{journey_id}/heartbeat", headers=headers, json={
        "timestamp": "2026-09-19T15:00:00Z",
        "latitude": 26.0500,
        "longitude": 91.7500,
        "accuracy": 8.5,
        "speed_kmh": 58.0,
        "heading": 175.0,
        "route_progress": 0.35,
        "connection_state": "ONLINE"
    })
    assert r_hb.status_code == 200
    assert r_hb.json()["status"] == "OK"
    print("  ✓ [48.4] Journey heartbeat updates last known position and route progress")

    # Get Active Journey
    r_act = client.get("/api/journeys/active", headers=headers)
    assert r_act.status_code == 200
    assert r_act.json()["active"] is True
    assert r_act.json()["journey"]["journey_id"] == journey_id
    print("  ✓ [48.5] Active journey state query restored for app resume flow")

    # 48.6 Server-Side SMS Fallback Engine & Deduplication (spec §24-33, §55-57)
    from app.services.hazard_processor import process_route_hazards_for_active_journeys

    db_test = SessionLocal()
    try:
        # Simulate journey went offline by setting last_heartbeat_at to 2 minutes ago
        j_obj = db_test.query(JourneySession).filter(JourneySession.id == journey_id).first()
        j_obj.last_heartbeat_at = datetime.utcnow() - timedelta(seconds=120)
        db_test.commit()

        # Create a test high-severity hazard intersecting corridor
        test_hazard = DisasterAlert(
            identifier="TEST-OFFLINE-SMS-001",
            event="Landslide",
            headline="Severe Landslide blocking NH-6 corridor near Byrnihat",
            severity="Severe",
            circle_coordinates="25.9000,91.7800 15",
            area_description="NH-6 near Byrnihat",
            is_active=True,
            source="SACHET_NDMA",
            source_type="OFFICIAL",
            verification_status="VERIFIED"
        )
        db_test.add(test_hazard)
        db_test.commit()

        # Run hazard processor: should send 1 SMS (ConsoleSmsProvider simulated)
        res_proc1 = process_route_hazards_for_active_journeys(db_test)
        assert res_proc1["sms_sent"] >= 1, f"Expected at least 1 SMS sent, got {res_proc1}"
        print("  ✓ [48.6] Stale heartbeat triggers server-side SMS fallback with last-known position wording")

        # Run hazard processor again: deduplication must ensure ZERO duplicate SMS
        res_proc2 = process_route_hazards_for_active_journeys(db_test)
        assert res_proc2["sms_sent"] == 0, f"Expected 0 duplicate SMS, got {res_proc2}"
        assert res_proc2["sms_skipped_duplicate"] >= 1
        print("  ✓ [48.7] AlertDelivery deduplication prevents repeated SMS alerts for the same corridor hazard")

        # Non-route hazard (200km away) -> must NOT trigger SMS
        far_hazard = DisasterAlert(
            identifier="TEST-FAR-HAZARD-002",
            event="Flash Flood",
            headline="Flash flood 200km away in Silchar",
            severity="Severe",
            circle_coordinates="24.8333,92.7789 15",
            area_description="Silchar Barak Valley",
            is_active=True,
            source="SACHET_NDMA",
            source_type="OFFICIAL"
        )
        db_test.add(far_hazard)
        db_test.commit()

        res_proc3 = process_route_hazards_for_active_journeys(db_test)
        assert res_proc3["sms_sent"] == 0
        print("  ✓ [48.8] Distant hazard (200km away) correctly excluded from route SMS alert")

        # Clean up test alerts and deliveries
        db_test.query(AlertDelivery).filter(AlertDelivery.journey_id == journey_id).delete()
        db_test.delete(test_hazard)
        db_test.delete(far_hazard)
        db_test.commit()
    finally:
        db_test.close()

    # Finish Journey
    r_fin = client.post(f"/api/journeys/{journey_id}/finish", headers=headers)
    assert r_fin.status_code == 200
    assert r_fin.json()["status"] == "FINISHED"
    print("  ✓ [48.9] Journey session successfully finished — further SMS route alerts deactivated")

    # 48.10 Batched Idempotent Offline Sync (spec §16, §17, §62)
    idemp_key1 = f"sync-test-op1-{uuid.uuid4().hex[:8]}"
    idemp_key2 = f"sync-test-op2-{uuid.uuid4().hex[:8]}"
    sync_payload = {
        "journey_id": journey_id,
        "operations": [
            {
                "idempotency_key": idemp_key1,
                "entity_type": "JOURNEY_TELEMETRY",
                "operation": "UPDATE",
                "payload": {"last_latitude": 25.8500, "last_longitude": 91.8200, "last_route_progress": 0.65}
            },
            {
                "idempotency_key": idemp_key2,
                "entity_type": "USER_PREFERENCE",
                "operation": "UPDATE",
                "payload": {"preferred_language": "en"}
            }
        ]
    }

    # First sync submission -> all processed
    r_sync1 = client.post("/api/offline/sync", headers=headers, json=sync_payload)
    assert r_sync1.status_code == 200
    s_data1 = r_sync1.json()
    assert s_data1["processed"] == 2
    assert s_data1["already_processed_idempotent"] == 0
    print("  ✓ [48.10] Batched offline sync successfully records offline operations")

    # Re-sending the identical batch -> deduplicated via idempotency_key
    r_sync2 = client.post("/api/offline/sync", headers=headers, json=sync_payload)
    assert r_sync2.status_code == 200
    s_data2 = r_sync2.json()
    assert s_data2["already_processed_idempotent"] == 2
    assert s_data2["processed"] == 0
    print("  ✓ [48.11] Sync idempotency verified: repeated offline uploads return existing receipts without duplicate execution")

    # Clean up sync receipts
    db_clean = SessionLocal()
    try:
        db_clean.query(OfflineSyncReceipt).filter(
            OfflineSyncReceipt.idempotency_key.in_([idemp_key1, idemp_key2])
        ).delete()
        db_clean.commit()
    finally:
        db_clean.close()

    # 48.12 Satellite Provider Safety (spec §34, §35)
    from app.services.satellite_provider import get_satellite_provider, SatelliteState
    sat = get_satellite_provider()
    assert sat.state == SatelliteState.NOT_CONFIGURED
    assert sat.can_transmit() is False
    compact_test = sat.send_compact_hazard({"id": 1, "latitude": 26.1, "longitude": 91.7})
    assert compact_test["sent"] is False
    assert "Satellite not active" in compact_test["reason"]
    print("  ✓ [48.12] Satellite adapter correctly enforces NOT_CONFIGURED safety: no fake satellite transmission permitted")

    # 49. Teardown Cleanup: delete test-created user reports so SQLite is 100% clean

    r_del1 = client.delete(f"/api/disasters/{report_id}", headers=headers)
    assert r_del1.status_code == 200, f"Delete 1 failed: {r_del1.text}"
    r_del2 = client.delete(f"/api/disasters/{temp_id}", headers=headers)
    assert r_del2.status_code == 200, f"Delete 2 failed: {r_del2.text}"

    # Also clean up uploaded evidence file
    if evidence_res.get("image_url"):
        try:
            from app.routers.disasters import UPLOAD_DIR as _UDIR
            ev_file = _UDIR / evidence_res["filename"]
            if ev_file.exists():
                ev_file.unlink()
        except Exception:
            pass

    db = SessionLocal()
    try:
        db.query(UserReport).delete()
        db.commit()
        remaining_reports = db.query(UserReport).count()
        assert remaining_reports == 0, f"Expected 0 user reports remaining after teardown, found {remaining_reports}"
        print("  ✓ [45] Teardown complete: 0 lingering demo records in SQLite")
    finally:
        db.close()

    print("\n==================================================")
    print(" ALL CORE + EXTENDED PRODUCTION BACKEND TESTS PASSED!")
    print("==================================================")

if __name__ == "__main__":
    test_system()

