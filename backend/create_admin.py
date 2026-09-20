"""
NEXORA - Secure Administrator Provisioning Script
Usage:
    Interactive mode:
        python create_admin.py

    Argument mode:
        python create_admin.py --email admin@domain.gov.in --name "Director MDoNER" --password "YourStrongPassword123" --state "All"
"""
import sys
import os
import argparse
import getpass
import re
import bcrypt

# Ensure backend root is on Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine, Base
from app.models import User, AuditLog

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def validate_email(email: str) -> bool:
    pattern = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    return bool(re.match(pattern, email))

def validate_password(pw: str) -> str:
    if len(pw) < 8:
        return "Password must be at least 8 characters long."
    if not re.search(r'[A-Z]', pw):
        return "Password must contain at least one uppercase letter."
    if not re.search(r'[0-9]', pw):
        return "Password must contain at least one number."
    return ""

def create_admin(name: str, email: str, password: str, state: str = "All", phone: str = None):
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Check if email exists
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            if existing.role == "admin":
                print(f"[ERROR] An administrator account with email '{email}' already exists.")
                return False
            else:
                # Upgrade existing account
                existing.role = "admin"
                existing.name = name or existing.name
                existing.password_hash = hash_pw(password)
                existing.is_active = True
                db.commit()
                print(f"[SUCCESS] Existing user '{email}' has been successfully upgraded to Administrator.")
                return True

        new_admin = User(
            name=name,
            email=email,
            password_hash=hash_pw(password),
            role="admin",
            state=state or "All",
            phone=phone,
            is_active=True
        )
        db.add(new_admin)
        db.commit()
        db.refresh(new_admin)

        audit = AuditLog(
            user_email=email,
            action="ADMIN_CLI_PROVISION",
            details=f"Initial administrator account created via secure CLI tool for '{name}'."
        )
        db.add(audit)
        db.commit()

        print("=" * 60)
        print("  [SUCCESS] Administrator account provisioned successfully!")
        print(f"  Name:   {new_admin.name}")
        print(f"  Email:  {new_admin.email}")
        print(f"  Role:   {new_admin.role}")
        print(f"  State:  {new_admin.state}")
        print("=" * 60)
        return True
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to create admin: {e}")
        return False
    finally:
        db.close()

def main():
    parser = argparse.ArgumentParser(description="NEXORA Secure Administrator Provisioning Tool")
    parser.add_argument("--name", help="Full name of administrator")
    parser.add_argument("--email", help="Administrator email address")
    parser.add_argument("--password", help="Administrator password (optional, prompted securely if omitted)")
    parser.add_argument("--state", default="All", help="State jurisdiction (default: All)")
    parser.add_argument("--phone", default=None, help="Contact mobile number")

    args = parser.parse_args()

    # Interactive mode if arguments are missing
    if not args.email or not args.name:
        print("=" * 60)
        print("  NEXORA - MDoNER Admin Account Setup")
        print("=" * 60)
        name = input("Enter Full Name: ").strip()
        while not name:
            name = input("Name cannot be empty. Enter Full Name: ").strip()

        email = input("Enter Administrator Email: ").strip()
        while not validate_email(email):
            print("Invalid email format.")
            email = input("Enter Administrator Email: ").strip()

        password = getpass.getpass("Enter Secure Password (hidden): ")
        err = validate_password(password)
        while err:
            print(f"Password error: {err}")
            password = getpass.getpass("Enter Secure Password (hidden): ")
            err = validate_password(password)

        confirm = getpass.getpass("Confirm Password (hidden): ")
        while password != confirm:
            print("Passwords do not match!")
            password = getpass.getpass("Enter Secure Password (hidden): ")
            confirm = getpass.getpass("Confirm Password (hidden): ")

        state = input("Enter State Domain [default: All]: ").strip() or "All"
        phone = input("Enter Phone Number (optional): ").strip() or None

        create_admin(name, email, password, state, phone)
    else:
        if not validate_email(args.email):
            print(f"[ERROR] Invalid email format: {args.email}")
            sys.exit(1)

        password = args.password
        if not password:
            password = getpass.getpass("Enter Secure Password (hidden): ")

        err = validate_password(password)
        if err:
            print(f"[ERROR] {err}")
            sys.exit(1)

        success = create_admin(args.name, args.email, password, args.state, args.phone)
        if not success:
            sys.exit(1)

if __name__ == "__main__":
    main()
