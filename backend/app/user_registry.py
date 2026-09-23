import os
import json
import bcrypt
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from .models import User

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
VAULT_FILE = os.path.join(DATA_DIR, "user_registry_vault.json")

# Deterministic static bcrypt hash for default test accounts (Password: Password@123)
STATIC_TEST_HASH = "$2b$12$Vch20WoKdKg2YI8qrryS3.ABAA5pT55SNkShHmWGcnTeKPLi7w9fO"

DEFAULT_SEED_USERS = [
    {
        "name": "Ram Kumar",
        "email": "ram@gmail.com",
        "password_hash": STATIC_TEST_HASH,
        "role": "citizen",
        "state": "Assam",
        "phone": "+919876543210",
        "sms_alerts_enabled": True,
        "is_active": True
    },
    {
        "name": "Ram Kumar",
        "email": "ram@gmail.com",
        "password_hash": STATIC_TEST_HASH,
        "role": "citizen",
        "state": "Assam",
        "phone": "+919876543210",
        "sms_alerts_enabled": True,
        "is_active": True
    },
    {
        "name": "Test Citizen",
        "email": "citizen.test@nexora.gov.in",
        "password_hash": STATIC_TEST_HASH,
        "role": "citizen",
        "state": "Assam",
        "phone": "+919800000001",
        "sms_alerts_enabled": True,
        "is_active": True
    },
    {
        "name": "MDoNER Administrator",
        "email": "admin@nexora.gov.in",
        "password_hash": STATIC_TEST_HASH,
        "role": "admin",
        "state": "All",
        "phone": "+919800000000",
        "sms_alerts_enabled": True,
        "is_active": True
    },
    {
        "name": "Logistics Officer",
        "email": "logistics@nexora.gov.in",
        "password_hash": STATIC_TEST_HASH,
        "role": "logistics_operator",
        "state": "Assam",
        "phone": "+919800000002",
        "sms_alerts_enabled": True,
        "is_active": True
    }
]

def load_vault_registry() -> Dict[str, Dict[str, Any]]:
    """Load persistent vault registry from JSON file."""
    os.makedirs(DATA_DIR, exist_ok=True)
    registry = {}
    
    # Pre-populate default seed accounts
    for user_data in DEFAULT_SEED_USERS:
        registry[user_data["email"].lower()] = user_data

    if os.path.exists(VAULT_FILE):
        try:
            with open(VAULT_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    for email, data in saved.items():
                        registry[email.lower()] = data
        except Exception as e:
            print(f"[USER REGISTRY] Notice loading vault file: {e}")

    return registry

def save_user_to_vault(user_dict: Dict[str, Any]):
    """Save a user record to the persistent JSON vault file."""
    os.makedirs(DATA_DIR, exist_ok=True)
    registry = load_vault_registry()
    email_key = user_dict["email"].strip().lower()
    registry[email_key] = {
        "name": user_dict.get("name", "User"),
        "email": email_key,
        "password_hash": user_dict.get("password_hash"),
        "role": user_dict.get("role", "citizen"),
        "state": user_dict.get("state", "Assam"),
        "phone": user_dict.get("phone"),
        "sms_alerts_enabled": bool(user_dict.get("sms_alerts_enabled", True)),
        "is_active": bool(user_dict.get("is_active", True))
    }
    try:
        with open(VAULT_FILE, "w", encoding="utf-8") as f:
            json.dump(registry, f, indent=2)
        print(f"[USER REGISTRY] Saved user '{email_key}' to persistent vault.")
    except Exception as e:
        print(f"[USER REGISTRY] Notice saving vault file: {e}")

def sync_registry_to_db(db: Session):
    """
    Ensure all backed-up users (including Ram@gmail.com and admin accounts)
    exist in the SQL database table. Called at startup and before login checks.
    """
    registry = load_vault_registry()
    synced_count = 0

    for email_key, udata in registry.items():
        existing = db.query(User).filter(User.email.ilike(email_key)).first()
        if not existing:
            new_user = User(
                name=udata.get("name", "User"),
                email=email_key,
                password_hash=udata.get("password_hash"),
                role=udata.get("role", "citizen"),
                state=udata.get("state", "Assam"),
                phone=udata.get("phone"),
                sms_alerts_enabled=bool(udata.get("sms_alerts_enabled", True)),
                is_active=bool(udata.get("is_active", True))
            )
            db.add(new_user)
            synced_count += 1
        elif udata.get("password_hash") and existing.password_hash != udata["password_hash"]:
            existing.password_hash = udata["password_hash"]
            synced_count += 1

    if synced_count > 0:
        try:
            db.commit()
            print(f"[USER REGISTRY] Successfully restored/synced {synced_count} persistent user accounts into DB.")
        except Exception as e:
            db.rollback()
            print(f"[USER REGISTRY] Notice syncing users to DB: {e}")
