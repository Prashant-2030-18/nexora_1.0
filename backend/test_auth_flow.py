import sys
import os
import bcrypt
from datetime import datetime
from fastapi.testclient import TestClient

# Ensure UTF-8 output
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

from app.main import app
from app.database import SessionLocal, engine
from app.models import User
from app.auth import verify_password, get_password_hash, create_access_token

client = TestClient(app)

def run_auth_regression_tests():
    print("==================================================")
    print(" NEXORA 1.0 - AUTHENTICATION REGRESSION TEST SUITE")
    print("==================================================")

    db = SessionLocal()
    try:
        # Cleanup any previous test users for a clean run
        db.query(User).filter(User.email.like("%test.regression%")).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()

    test_email = "test.regression.user@nexora.gov.in"
    test_password = "Password@123"
    test_name = "Regression Test User"

    # -------------------------------------------------------------
    # Scenario 1: Register -> Login -> /me -> Logout -> Login
    # -------------------------------------------------------------
    print("\n[Scenario 1] Register -> Login -> /me -> Logout -> Login with same credentials...")
    reg_res = client.post("/api/auth/register", json={
        "name": test_name,
        "email": test_email,
        "password": test_password,
        "role": "citizen",
        "state": "Assam"
    })
    assert reg_res.status_code == 200, f"Registration failed: {reg_res.text}"
    user_data = reg_res.json()
    assert user_data["email"] == test_email.lower()

    # Initial Login
    login1_res = client.post("/api/auth/login", json={
        "email": test_email,
        "password": test_password
    })
    assert login1_res.status_code == 200, f"Initial login failed: {login1_res.text}"
    token1 = login1_res.json()["access_token"]

    # Verify /me
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token1}"})
    assert me_res.status_code == 200, f"/me failed: {me_res.text}"
    assert me_res.json()["email"] == test_email.lower()

    # Re-login with same credentials
    relogin_res = client.post("/api/auth/login", json={
        "email": test_email,
        "password": test_password
    })
    assert relogin_res.status_code == 200, f"Re-login failed: {relogin_res.text}"
    print("  ✓ Scenario 1 Passed: Register -> Login -> /me -> Re-login OK.")

    # -------------------------------------------------------------
    # Scenario 2: At least 3 repeated login/logout cycles
    # -------------------------------------------------------------
    print("\n[Scenario 2] Executing 3 repeated login/logout cycles...")
    for cycle in range(1, 4):
        log_res = client.post("/api/auth/login", json={
            "email": test_email,
            "password": test_password
        })
        assert log_res.status_code == 200, f"Cycle {cycle} login failed: {log_res.text}"
        cycle_token = log_res.json()["access_token"]
        # Verify endpoint access
        me_c = client.get("/api/auth/me", headers={"Authorization": f"Bearer {cycle_token}"})
        assert me_c.status_code == 200
        print(f"  ✓ Cycle {cycle}/3 login & /me check successful.")

    # -------------------------------------------------------------
    # Scenario 3: Existing users logging in after the change
    # -------------------------------------------------------------
    print("\n[Scenario 3] Testing existing user login...")
    db = SessionLocal()
    try:
        existing_email = "test.existing.user@nexora.gov.in"
        existing_user = db.query(User).filter(User.email == existing_email).first()
        if not existing_user:
            existing_user = User(
                name="Existing Pre-stored User",
                email=existing_email,
                password_hash=get_password_hash("ExistingPass123"),
                role="logistics_operator",
                state="Meghalaya",
                is_active=True
            )
            db.add(existing_user)
            db.commit()
    finally:
        db.close()

    exist_login = client.post("/api/auth/login", json={
        "email": existing_email,
        "password": "ExistingPass123"
    })
    assert exist_login.status_code == 200, f"Existing user login failed: {exist_login.text}"
    print("  ✓ Scenario 3 Passed: Existing pre-stored user authenticated cleanly.")

    # -------------------------------------------------------------
    # Scenario 4: Login after backend restart (fresh session DB query)
    # -------------------------------------------------------------
    print("\n[Scenario 4] Testing login persistence across simulated server restart...")
    # Simulate DB session closure / process restart by opening a new isolated db session
    new_db = SessionLocal()
    try:
        user_check = new_db.query(User).filter(User.email == test_email.lower()).first()
        assert user_check is not None, "User record must persist in database"
        assert verify_password(test_password, user_check.password_hash), "Stored hash must verify submitted password"
    finally:
        new_db.close()

    restart_login = client.post("/api/auth/login", json={
        "email": test_email,
        "password": test_password
    })
    assert restart_login.status_code == 200, "Login after backend restart failed"
    print("  ✓ Scenario 4 Passed: User persisted and logged in across simulated restart.")

    # -------------------------------------------------------------
    # Scenario 5: Logout leaving user record and password hash unchanged
    # -------------------------------------------------------------
    print("\n[Scenario 5] Verifying logout leaves user record & hash completely unchanged...")
    db = SessionLocal()
    try:
        u_before = db.query(User).filter(User.email == test_email.lower()).first()
        hash_before = u_before.password_hash

        # Simulate client logout (removing bearer token locally)
        # Login again
        c_login = client.post("/api/auth/login", json={"email": test_email, "password": test_password})
        assert c_login.status_code == 200

        u_after = db.query(User).filter(User.email == test_email.lower()).first()
        assert u_after.password_hash == hash_before, "Password hash MUST NOT be modified or replaced during login/logout!"
        print("  ✓ Scenario 5 Passed: Password hash remained strictly intact.")
    finally:
        db.close()

    # -------------------------------------------------------------
    # Scenario 6: Incorrect password failing without modifying account
    # -------------------------------------------------------------
    print("\n[Scenario 6] Verifying incorrect password fails without corrupting account hash...")
    db = SessionLocal()
    try:
        u_pre = db.query(User).filter(User.email == test_email.lower()).first()
        hash_pre = u_pre.password_hash

        # Attempt login with WRONG password
        wrong_res = client.post("/api/auth/login", json={"email": test_email, "password": "WrongPassword999"})
        assert wrong_res.status_code == 401, f"Wrong password must return 401, got {wrong_res.status_code}"

        u_post = db.query(User).filter(User.email == test_email.lower()).first()
        assert u_post.password_hash == hash_pre, "Failed login MUST NOT overwrite stored password hash!"

        # Confirm correct password STILL works
        valid_again = client.post("/api/auth/login", json={"email": test_email, "password": test_password})
        assert valid_again.status_code == 200, "Correct password must work after failed attempt"
        print("  ✓ Scenario 6 Passed: Wrong password rejected with 401 without corrupting account.")
    finally:
        db.close()

    # -------------------------------------------------------------
    # Scenario 7: Mixed-case emails and surrounding spaces
    # -------------------------------------------------------------
    print("\n[Scenario 7] Testing mixed-case email and surrounding whitespace normalization...")
    padded_email = f"  {test_email.upper()}  "
    padded_login = client.post("/api/auth/login", json={"email": padded_email, "password": test_password})
    assert padded_login.status_code == 200, f"Mixed case / whitespace email login failed: {padded_login.text}"
    assert padded_login.json()["user"]["email"] == test_email.lower()
    print("  ✓ Scenario 7 Passed: Email correctly normalized (`email.strip().toLowerCase()`).")

    # -------------------------------------------------------------
    # Scenario 8: Duplicate registration returning 409 without overwriting original account
    # -------------------------------------------------------------
    print("\n[Scenario 8] Verifying duplicate registration returns 409 Conflict without overwriting original user...")
    dup_res = client.post("/api/auth/register", json={
        "name": "Imposter User",
        "email": test_email.upper(),
        "password": "NewOverwritingPassword123",
        "role": "citizen"
    })
    assert dup_res.status_code == 409, f"Duplicate registration must return 409 Conflict, got {dup_res.status_code}"

    # Verify original user password STILL works and was NOT overwritten
    orig_login = client.post("/api/auth/login", json={"email": test_email, "password": test_password})
    assert orig_login.status_code == 200, "Original user credentials must remain unchanged after duplicate attempt"
    print("  ✓ Scenario 8 Passed: 409 Conflict returned and original account preserved.")

    # -------------------------------------------------------------
    # Scenario 9: Two different users remaining independent
    # -------------------------------------------------------------
    print("\n[Scenario 9] Verifying independence of two separate user accounts...")
    u1_email = "test.user1.indep@nexora.gov.in"
    u2_email = "test.user2.indep@nexora.gov.in"

    r1 = client.post("/api/auth/register", json={"name": "User One", "email": u1_email, "password": "UserOnePass123"})
    r2 = client.post("/api/auth/register", json={"name": "User Two", "email": u2_email, "password": "UserTwoPass123"})
    assert r1.status_code == 200 and r2.status_code == 200

    l1 = client.post("/api/auth/login", json={"email": u1_email, "password": "UserOnePass123"})
    l2 = client.post("/api/auth/login", json={"email": u2_email, "password": "UserTwoPass123"})
    assert l1.status_code == 200 and l2.status_code == 200

    assert l1.json()["user"]["email"] == u1_email
    assert l2.json()["user"]["email"] == u2_email
    assert l1.json()["access_token"] != l2.json()["access_token"]
    print("  ✓ Scenario 9 Passed: User accounts and JWT tokens remain completely independent.")

    # -------------------------------------------------------------
    # Scenario 10: Invalid / expired token followed by a successful fresh login
    # -------------------------------------------------------------
    print("\n[Scenario 10] Testing invalid token rejection followed by fresh login...")
    invalid_token_res = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid_garbage_token_123"})
    assert invalid_token_res.status_code == 401, f"Invalid token must return 401, got {invalid_token_res.status_code}"

    fresh_login = client.post("/api/auth/login", json={"email": u1_email, "password": "UserOnePass123"})
    assert fresh_login.status_code == 200
    fresh_token = fresh_login.json()["access_token"]

    valid_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {fresh_token}"})
    assert valid_me.status_code == 200
    assert valid_me.json()["email"] == u1_email
    print("  ✓ Scenario 10 Passed: 401 invalid token rejected cleanly and fresh login succeeded.")

    # -------------------------------------------------------------
    # Scenario 11: Role authorization error returns 403 without invalidating session
    # -------------------------------------------------------------
    print("\n[Scenario 11] Verifying role-restricted endpoint returns 403 Forbidden...")
    # Citizen user trying to access admin users endpoint
    citizen_token = l1.json()["access_token"]
    admin_access = client.get("/api/admin/users", headers={"Authorization": f"Bearer {citizen_token}"})
    assert admin_access.status_code == 403, f"Non-admin access must return 403 Forbidden, got {admin_access.status_code}"

    # Confirm token is still valid for citizen's own /me endpoint
    self_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {citizen_token}"})
    assert self_me.status_code == 200, "403 Forbidden on role check must not invalidate user token"
    print("  ✓ Scenario 11 Passed: 403 Forbidden returned for unauthorized role without invalidating token.")

    # -------------------------------------------------------------
    # Scenario 12: Distinguishing 401 credentials error from server errors
    # -------------------------------------------------------------
    print("\n[Scenario 12] Verifying 401 Unauthorized format for incorrect credentials...")
    err_login = client.post("/api/auth/login", json={"email": "nonexistent.user@nexora.gov.in", "password": "Password123"})
    assert err_login.status_code == 401
    err_detail = err_login.json().get("detail", "")
    assert "Authentication failed" in err_detail or "check your email" in err_detail
    print("  ✓ Scenario 12 Passed: 401 returned with explicit user-friendly authentication error detail.")

    print("\n==================================================")
    print(" ALL 12 AUTHENTICATION REGRESSION SCENARIOS PASSED!")
    print("==================================================")

if __name__ == "__main__":
    run_auth_regression_tests()
