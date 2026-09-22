import os
import json
import bcrypt
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from .models import User

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
BACKUP_FILE = os.path.join(DATA_DIR, "user_registry_backup.json")

def _get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

# Default seed accounts guaranteed to always exist and work across any restart
DEFAULT_SEED_USERS = [
    {
        "name": "Ram Kumar",
        "email": "ram@gmail.com",
        "password_hash": _get_password_hash("TestPassword123"),
        "role": "citizen",
        "state": "Assam",
        "phone": "+919876543210",
        "sms_alerts_enabled": True,
        "is_active": True
    },
    {
        "name": "Test Citizen",
        "email": "citizen.test@nexora.gov.in",
        "password_hash": _get_password_hash("TestPassword123"),
        "role": "citizen",
        "state": "Assam",
        "phone": "+919800000001",
        "sms_alerts_enabled": True,
        "is_active": True
    },
    {
        "name": "MDoNER Administrator",
        "email": "admin@nexora.gov.in",
        "password_hash": _get_password_hash("TestPassword123"),
        "role": "admin",
        "state": "All",
        "phone": "+919800000000",
        "sms_alerts_enabled": True,
        "is_active": True
    },
    {
        "name": "Logistics Officer",
        "email": "logistics@nexora.gov.in",
        "password_hash": _get_password_hash("TestPassword123"),
        "role": "logistics_operator",
        "state": "Assam",
        "phone": "+919800000002",
        "sms_alerts_enabled": True,
        "is_active": True
    }
]

def load_backup_registry() -> Dict[str, Dict[str, Any]]:
    """Load persistent backup registry from JSON file."""
    os.makedirs(DATA_DIR, exist_ok=True)
    registry = {}
    
    # Pre-populate defaults
    for user_data in DEFAULT_SEED_USERS:
        registry[user_data["email"].lower()] = user_data

    if os.path.exists(BACKUP_FILE):
        try:
            with open(BACKUP_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    for email, data in saved.items():
                        registry[email.lower()] = data
        except Exception as e:
            print(f"[USER REGISTRY] Warning loading backup file: {e}")

    return registry

def save_user_to_backup(user_dict: Dict[str, Any]):
    """Save a user record to the persistent JSON backup file."""
    os.makedirs(DATA_DIR, exist_ok=True)
    registry = load_backup_registry()
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
        with open(BACKUP_FILE, "w", encoding="utf-8") as f:
            json.dump(registry, f, indent=2)
        print(f"[USER REGISTRY] Backed up user '{email_key}' to persistent registry file.")
    except Exception as e:
        print(f"[USER REGISTRY] Warning saving backup file: {e}")

def sync_registry_to_db(db: Session):
    """
    Ensure all backed-up users (including Ram@gmail.com and admin accounts)
    exist in the SQL database table. Called at startup and before login checks.
    """
    registry = load_backup_registry()
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

    if synced_count > 0:
        try:
            db.commit()
            print(f"[USER REGISTRY] Successfully restored/synced {synced_count} persistent user accounts into DB.")
        except Exception as e:
            db.rollback()
            print(f"[USER REGISTRY] Warning syncing users to DB: {e}")
