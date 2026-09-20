import pytest
from app.routers.auth import normalize_mobile_number
from app.schemas import UserCreate

def test_phone_normalization():
    # 10 digits Indian mobile number -> auto-prefixed with +91
    assert normalize_mobile_number("9876543210") == "+919876543210"
    assert normalize_mobile_number("  9876543210  ") == "+919876543210"
    assert normalize_mobile_number("+91 98765 43210") == "+919876543210"
    assert normalize_mobile_number("+91-9876543210") == "+919876543210"
    assert normalize_mobile_number("09876543210") == "+919876543210"
    
    # International number
    assert normalize_mobile_number("+14155552671") == "+14155552671"
    
    # Empty or None
    assert normalize_mobile_number("") is None
    assert normalize_mobile_number(None) is None
    
    # Invalid length raises HTTPException
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        normalize_mobile_number("123")
    assert exc_info.value.status_code == 400

    with pytest.raises(HTTPException) as exc_info:
        normalize_mobile_number("+12345678901234567890")
    assert exc_info.value.status_code == 400

def test_user_create_schema_phone():
    u = UserCreate(
        name="Test Driver",
        email="driver@test.in",
        password="Password123",
        mobile_number="9876543210",
        sms_alerts_enabled=True,
    )
    assert u.mobile_number == "9876543210"
    assert u.sms_alerts_enabled is True
