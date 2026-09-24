import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, AuditLog
from ..schemas import UserCreate, UserLogin, Token, UserResponse
from ..auth import verify_password, get_password_hash, create_access_token, get_current_user, require_auth

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

def normalize_mobile_number(raw: Optional[str]) -> Optional[str]:
    """
    Normalize phone number to international E.164 format.
    - Default Indian numbers (10 digits) become +91XXXXXXXXXX
    - Strips whitespace, dashes, parentheses
    - Preserves other valid country codes (e.g. +1, +44, +880)
    """
    if not raw or not raw.strip():
        return None
    cleaned = re.sub(r"[\s\-\(\)\.]", "", raw.strip())
    if not cleaned:
        return None
    if cleaned.startswith("+"):
        digits = cleaned[1:]
        if digits.isdigit() and 7 <= len(digits) <= 15:
            return f"+{digits}"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid international phone number format. Expected e.g. +919876543210"
        )
    if cleaned.startswith("00"):
        digits = cleaned[2:]
        if digits.isdigit() and 7 <= len(digits) <= 15:
            return f"+{digits}"
    if cleaned.isdigit() and len(cleaned) == 10:
        return f"+91{cleaned}"
    if cleaned.isdigit() and len(cleaned) == 11 and cleaned.startswith("0"):
        return f"+91{cleaned[1:]}"
    if cleaned.isdigit() and len(cleaned) == 12 and cleaned.startswith("91"):
        return f"+{cleaned}"
    if cleaned.isdigit() and 7 <= len(cleaned) <= 15:
        return f"+{cleaned}"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid mobile number. Please enter a valid 10-digit number or international format (+91...)."
    )

@router.post("/register", response_model=UserResponse)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    # Restrict normal public registration from claiming 'admin' role
    role = user_in.role.lower() if user_in.role else "citizen"
    if role not in ["citizen", "logistics_operator"]:
        role = "citizen"

    # Password complexity validation
    if not user_in.password or len(user_in.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )
    if not re.search(r"[A-Z]", user_in.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one uppercase letter."
        )
    if not re.search(r"[0-9]", user_in.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one number."
        )

    raw_phone = user_in.phone or user_in.mobile_number
    normalized_phone = normalize_mobile_number(raw_phone)

    norm_email = user_in.email.strip().lower()
    existing = db.query(User).filter(User.email == norm_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists. Please sign in."
        )

    new_user = User(
        name=user_in.name.strip(),
        email=norm_email,
        password_hash=get_password_hash(user_in.password),
        role=role,
        state=user_in.state or "Assam",
        phone=normalized_phone,
        sms_alerts_enabled=bool(user_in.sms_alerts_enabled),
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Log audit action
    audit = AuditLog(
        user_email=new_user.email,
        action="USER_REGISTRATION",
        details=f"New user registered with role '{role}' for state '{new_user.state}' with phone '{normalized_phone}'."
    )
    db.add(audit)
    db.commit()

    return new_user

@router.post("/login", response_model=Token)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    norm_email = login_data.email.strip().lower()

    # Query persistent database for user by normalized email
    user = db.query(User).filter(User.email == norm_email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Please check your email and password."
        )

    # Strictly verify submitted password against stored hash without modifying DB
    if not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Please check your email and password."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive. Please contact the MDoNER administrator."
        )

    access_token = create_access_token(data={"sub": user.email, "role": user.role, "name": user.name})
    
    user_dict = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "state": user.state,
        "phone": user.phone,
        "mobile_number": user.phone,
        "sms_alerts_enabled": bool(getattr(user, "sms_alerts_enabled", False)),
        "is_active": user.is_active
    }

    # Audit log
    audit = AuditLog(
        user_email=user.email,
        action="USER_LOGIN",
        details=f"User logged in successfully with role '{user.role}'."
    )
    db.add(audit)
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_dict
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(require_auth)):
    return current_user
