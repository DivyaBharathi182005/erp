from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from database import get_db
import models
from auth import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, decode_token, get_current_user,
    validate_password_strength
)
from datetime import timedelta
from collections import defaultdict
import time

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ─── Simple in-memory rate limiter (replace with Redis in production) ─────────
_login_attempts: dict = defaultdict(list)
MAX_ATTEMPTS = 10
WINDOW_SECONDS = 300  # 5 minutes

def check_rate_limit(ip: str):
    now = time.time()
    attempts = _login_attempts[ip]
    # Keep only recent attempts
    _login_attempts[ip] = [t for t in attempts if now - t < WINDOW_SECONDS]
    if len(_login_attempts[ip]) >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {WINDOW_SECONDS // 60} minutes."
        )
    _login_attempts[ip].append(now)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenRefreshRequest(BaseModel):
    refresh_token: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/login")
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # Rate limit by IP
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(client_ip)

    user = db.query(models.User).filter(models.User.email == data.email.lower().strip()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact admin."
        )

    token_data = {"sub": str(user.id)}
    access_token = create_access_token(token_data, timedelta(minutes=60))
    refresh_token = create_refresh_token(token_data)

    # Clear login attempts on success
    _login_attempts.pop(client_ip, None)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 3600,
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "photo_url": user.photo_url,
    }


@router.post("/refresh")
def refresh_token(data: TokenRefreshRequest, db: Session = Depends(get_db)):
    """Exchange refresh token for new access token"""
    try:
        payload = decode_token(data.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        user_id = payload.get("sub")
        user = db.query(models.User).filter(models.User.id == int(user_id)).first()
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or deactivated")
        new_access = create_access_token({"sub": str(user.id)})
        return {"access_token": new_access, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Could not refresh token")


@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "photo_url": current_user.photo_url,
        "is_active": current_user.is_active,
    }


@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if not validate_password_strength(data.new_password):
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 8 characters with 1 uppercase and 1 digit"
        )
    current_user.password_hash = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}
