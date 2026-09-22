import sys
import requests

BASE_URL = "https://nexora-api-bybb.onrender.com"

def test_login_logout_repeat():
    email = "citizen.test@nexora.gov.in"
    password = "TestPassword123"

    print("=== Testing Repeated Login / Logout Sequence ===")
    
    # First, attempt login or register if test account doesn't exist yet
    login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if login_res.status_code == 401:
        print("Creating initial test user for repeated test...")
        reg_res = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Test Citizen",
            "email": email,
            "password": password,
            "role": "citizen",
            "state": "Assam"
        })
        print("Register status:", reg_res.status_code)
        assert reg_res.status_code in [200, 201, 409]

    # Repeat login/logout cycle 3 times
    tokens = []
    user_ids = []

    for i in range(1, 4):
        print(f"\n--- Iteration {i} ---")
        # Step 1: Login
        res = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email.upper(), "password": password})
        print(f"[{i}] Login status:", res.status_code)
        assert res.status_code == 200, f"Login failed on iteration {i}: {res.text}"
        
        data = res.json()
        token = data["access_token"]
        user_info = data["user"]
        tokens.append(token)
        user_ids.append(user_info["id"])
        print(f"[{i}] Token received. User ID: {user_info['id']}, Email: {user_info['email']}")

        # Step 2: Session restore check (/api/auth/me)
        me_res = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        print(f"[{i}] /api/auth/me status:", me_res.status_code)
        assert me_res.status_code == 200, f"GET /me failed on iteration {i}"
        me_data = me_res.json()
        assert me_data["email"].lower() == email.lower()
        assert me_data["id"] == user_info["id"]

        # Step 3: Logout (simulated on client side: token discarded)
        print(f"[{i}] Client logged out (token cleared from storage)")

    # Confirm user row remains unchanged across all 3 iterations
    print("\n--- Verifying User Row Integrity ---")
    assert len(set(user_ids)) == 1, "User ID changed across log ins!"
    print("[OK] User ID remained unchanged across all 3 iterations:", user_ids[0])

    # Confirm incorrect password returns 401
    print("\n--- Verifying Incorrect Password returns 401 ---")
    wrong_res = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "WrongPassword999"})
    print("Wrong password status:", wrong_res.status_code)
    assert wrong_res.status_code == 401, f"Expected 401 for wrong password, got {wrong_res.status_code}"
    print("[OK] Incorrect password correctly returned 401 Unauthorized")

    print("\n[SUCCESS] ALL LOGIN / LOGOUT REPEAT TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    test_login_logout_repeat()
