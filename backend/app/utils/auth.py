import bcrypt
import jwt
from datetime import datetime, timedelta
from typing import Callable, Optional
from os import getenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session
from app.core.config import engine
from app.core.policies import DISTRIBOX_ADMIN_POLICY
from app.orm.user import UserORM

SECRET_KEY = getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

security = HTTPBearer()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )


def create_access_token(
        data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserORM:
    """
    Dependency to get the current authenticated user from JWT token.
    Use this in your route handlers to protect endpoints.
    """
    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    with Session(engine) as session:
        user = session.get(UserORM, user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        user.last_activity = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def user_has_policy(user: UserORM, policy: str) -> bool:
    if user.is_admin:
        return True
    if DISTRIBOX_ADMIN_POLICY in user.policies:
        return True
    return policy in user.policies


def require_policy(policy: str) -> Callable:
    async def checker(current_user: UserORM = Depends(get_current_user)) -> UserORM:
        if not user_has_policy(current_user, policy):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "Missing required policies",
                    "missing_policies": [policy],
                }
            )
        return current_user

    return checker


async def get_current_admin_user(
        current_user: UserORM = Depends(get_current_user)) -> UserORM:
    """
    Dependency to ensure the current user is an admin.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
