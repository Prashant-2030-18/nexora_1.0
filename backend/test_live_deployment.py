"""
Comprehensive End-to-End Test for Live Vercel Frontend and Render Backend
"""
import urllib.request
import urllib.error
import json
import time
import re
import sys

VERCEL_URL = "https://nexora-1-0.vercel.app"
RENDER_URL = "https://nexora-api-bybb.onrender.com"

# Unique timestamped test credentials
UNIQUE_ID = int(time.time())
NEW_USER_EMAIL = f"judge_{UNIQUE_ID}@sih2026.gov.in"
NEW_USER_NAME = f"SIH Evaluation Officer {UNIQUE_ID % 1000}"
NEW_USER_PASS = "Passw0rdSIH2026!"
NEW_USER_PHONE = f"+9198{str(UNIQUE_ID)[-8:]}"

print("=" * 65)
print(f"  NEXORA LIVE DEPLOYMENT AUDIT -- TIMESTAMP: {UNIQUE_ID}")
print(f"  Vercel Frontend: {VERCEL_URL}")
print(f"  Render Backend:  {RENDER_URL}")
print("=" * 65)

def fetch(url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    headers.setdefault("User-Agent", "Mozilla/5.0")
    payload = None
    if data is not None:
        headers.setdefault("Content-Type", "application/json")
        payload = json.dumps(data).encode("utf-8")
    
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = resp.status
            content_type = resp.headers.get("Content-Type", "")
            body_bytes = resp.read()
            if "application/json" in content_type:
                parsed = json.loads(body_bytes.decode("utf-8"))
            else:
                parsed = body_bytes.decode("utf-8", errors="ignore")
            return status, parsed, dict(resp.headers)
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="ignore")
        return err.code, err_body, dict(err.headers)
    except Exception as exc:
        return 0, str(exc), {}

# TEST 1: Check Vercel index.html and JS bundle
print("\n[TEST 1] Probing Vercel Homepage and Assets...")
status, body, headers = fetch(f"{VERCEL_URL}/")
if status == 200:
    print(f"  [PASS] Homepage returns HTTP {status} (Server: {headers.get('Server', 'Vercel')})")
    js_match = re.search(r'src="([^"]*assets[^"]*\.js)"', body)
    if js_match:
        bundle_path = js_match.group(1)
        bundle_url = f"{VERCEL_URL}{bundle_path}" if bundle_path.startswith('/') else f"{VERCEL_URL}/{bundle_path}"
        b_status, b_code, _ = fetch(bundle_url)
        print(f"  [PASS] Active JS bundle: {bundle_path} -> HTTP {b_status} ({len(b_code)} bytes)")
        matches = set(re.findall(r'https?://[a-zA-Z0-9_\-\.]*onrender\.com[a-zA-Z0-9_\-\./]*', b_code))
        print(f"  [INFO] Render URLs found in bundle: {matches}")
else:
    print(f"  [FAIL] Homepage failed with HTTP {status}: {body[:200]}")

# TEST 2: Check Vercel API Reverse Proxy (/api/services/status)
print("\n[TEST 2] Testing Vercel API Proxy (https://nexora-1-0.vercel.app/api/services/status)...")
status, body, _ = fetch(f"{VERCEL_URL}/api/services/status")
if status == 200 and isinstance(body, dict):
    print(f"  [PASS] Vercel /api proxy active! Status: HTTP {status}")
    print(f"  [INFO] Backend API:  {body.get('backendApi', {}).get('status')}")
    print(f"  [INFO] Database:     {body.get('database', {}).get('status')} ({body.get('database', {}).get('detail')})")
    print(f"  [INFO] SACHET NDMA:  {body.get('sachetNdma', {}).get('status')} (Active count: {body.get('sachetNdma', {}).get('activeAlertsCount')})")
else:
    print(f"  [FAIL] Vercel API proxy returned: HTTP {status}: {str(body)[:200]}")

# TEST 3: Register BRAND NEW User through Vercel domain
print(f"\n[TEST 3] Registering brand new citizen user: {NEW_USER_EMAIL}...")
reg_payload = {
    "name": NEW_USER_NAME,
    "email": NEW_USER_EMAIL,
    "password": NEW_USER_PASS,
    "mobile_number": NEW_USER_PHONE,
    "sms_alerts_enabled": True,
    "role": "citizen",
    "state": "Assam"
}
status, body, _ = fetch(f"{VERCEL_URL}/api/auth/register", method="POST", data=reg_payload)
if status == 200 and isinstance(body, dict):
    print(f"  [PASS] Registration succeeded through Vercel! User ID: {body.get('id')}")
    print(f"  [INFO] Name:        {body.get('name')}")
    print(f"  [INFO] Email:       {body.get('email')}")
    print(f"  [INFO] Phone (SMS): {body.get('phone')}")
    print(f"  [INFO] Role:        {body.get('role')}")
else:
    print(f"  [FAIL] Registration failed with HTTP {status}: {body}")

# TEST 4: Login with the NEW user through Vercel domain
print(f"\n[TEST 4] Logging in with newly created user: {NEW_USER_EMAIL}...")
login_payload = {
    "email": NEW_USER_EMAIL,
    "password": NEW_USER_PASS
}
status, body, _ = fetch(f"{VERCEL_URL}/api/auth/login", method="POST", data=login_payload)
token = None
if status == 200 and isinstance(body, dict):
    token = body.get("access_token")
    print(f"  [PASS] Login succeeded! Token type: {body.get('token_type')}")
    print(f"  [INFO] User logged in: {body.get('user', {}).get('name')}")
    print(f"  [INFO] Access Token (sample): {token[:25]}...")
else:
    print(f"  [FAIL] Login failed with HTTP {status}: {body}")

# TEST 5: Verify JWT Authentication (/api/auth/me)
print(f"\n[TEST 5] Testing Authenticated Endpoint /api/auth/me with Bearer Token...")
if token:
    status, body, _ = fetch(f"{VERCEL_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    if status == 200 and isinstance(body, dict):
        print(f"  [PASS] Authenticated user confirmed: {body.get('name')} (Role: {body.get('role')})")
    else:
        print(f"  [FAIL] Auth verification failed: HTTP {status} -> {body}")
else:
    print("  - Skipped (no token)")

# TEST 6: OSRM Route Calculation through Vercel domain
print(f"\n[TEST 6] Testing OSRM Route Calculation via Vercel (Guwahati -> Shillong)...")
route_payload = {
    "origin": "Guwahati, Assam",
    "destination": "Shillong, Meghalaya",
    "origin_lat": 26.1445,
    "origin_lon": 91.7362,
    "dest_lat": 25.5788,
    "dest_lon": 91.8933,
    "travel_mode": "car"
}
status, body, _ = fetch(f"{VERCEL_URL}/api/routes/calculate", method="POST", data=route_payload)
if status == 200 and isinstance(body, dict):
    fastest = body.get("routes", {}).get("fastest", {})
    steps = body.get("navigation_steps", [])
    print(f"  [PASS] Route calculated! Distance: {fastest.get('distance_km')} km, ETA: {fastest.get('eta_formatted')}")
    print(f"  [INFO] Turn-by-turn navigation steps count: {len(steps)}")
    if steps:
        first = steps[0]
        print(f"  [INFO] First maneuver: '{first.get('instruction')}' on road '{first.get('road_name')}' ({first.get('distance_m')}m)")
else:
    print(f"  [FAIL] Route calculation failed with HTTP {status}: {str(body)[:200]}")

# TEST 7: Submit Citizen Ground Hazard Report through Vercel
print(f"\n[TEST 7] Submitting Citizen Disaster Report as {NEW_USER_NAME}...")
report_payload = {
    "disaster_type": "Road Breach / Culvert Collapse",
    "severity": "CRITICAL",
    "latitude": 26.1445,
    "longitude": 91.7362,
    "location_name": "NH-27 Kamrup Section, Assam",
    "description": "Culvert washed out due to torrential stream. Heavy trucks cannot cross.",
    "reporter_name": NEW_USER_NAME,
    "reporter_phone": NEW_USER_PHONE
}
status, body, _ = fetch(f"{VERCEL_URL}/api/user-reports", method="POST", data=report_payload)
if status == 200 and isinstance(body, dict):
    print(f"  [PASS] Ground report submitted successfully! Report ID: {body.get('id')}")
    print(f"  [INFO] AI Verification Status: {body.get('verification_status')}")
    print(f"  [INFO] AI Confidence Score:    {body.get('ai_confidence')}")
    print(f"  [INFO] Location Scope:         {body.get('location_scope')}")
else:
    print(f"  [FAIL] Report submission failed: HTTP {status}: {str(body)[:200]}")

print("\n" + "=" * 65)
print("  ALL 7 TESTS COMPLETED!")
print("=" * 65)
