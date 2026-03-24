from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from app.core.config import engine
from app.core.policies import expand_policies
from app.models.user_management import MissingPoliciesResponse, UserResponse
from app.orm.user import UserORM
from app.orm.user_settings import UserSettingsORM
from app.models.user_settings import UserSettingsResponse, UpdateUserSettingsRequest
from app.utils.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_policy,
)
from app.utils.crypto import encrypt_secret

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def to_user_response(user: UserORM) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        user=user.username,
        created_at=user.created_at,
        created_by=user.created_by,
        last_activity=user.last_activity,
        policies=expand_policies(user.policies),
    )


@router.post("/login", response_model=TokenResponse)
async def login(login_data: LoginRequest):
    """Login endpoint that returns a JWT token."""
    with Session(engine) as session:
        statement = select(UserORM).where(
            UserORM.username == login_data.username)
        user = session.exec(statement).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )

        if not verify_password(login_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )

        access_token = create_access_token(
            data={"sub": str(user.id), "username": user.username,
                  "is_admin": user.is_admin, "policies": user.policies}
        )

        return TokenResponse(access_token=access_token)


@router.get(
    "/me",
    response_model=UserResponse,
    dependencies=[Depends(require_policy("auth:me:get"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
async def get_current_user_info(
        current_user: UserORM = Depends(get_current_user)):
    """Get information about the currently logged-in user."""
    return to_user_response(current_user)


@router.post(
    "/change-password",
    dependencies=[Depends(require_policy("auth:changePassword"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
async def change_password(
    password_data: ChangePasswordRequest,
    current_user: UserORM = Depends(get_current_user)
):
    """Change the current user's password."""
    with Session(engine) as session:
        if not verify_password(password_data.current_password,
                               current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )

        if len(password_data.new_password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be at least 8 characters long"
            )

        user = session.get(UserORM, current_user.id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user.hashed_password = hash_password(password_data.new_password)
        user.password = encrypt_secret(password_data.new_password)
        user.last_activity = datetime.utcnow()
        session.add(user)
        session.commit()

        return {"message": "Password changed successfully"}


@router.get(
    "/settings",
    response_model=UserSettingsResponse,
    dependencies=[Depends(require_policy("auth:me:get"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
async def get_user_settings(
    current_user: UserORM = Depends(get_current_user),
):
    """Get the current user's settings."""
    with Session(engine) as session:
        settings = session.exec(
            select(UserSettingsORM).where(
                UserSettingsORM.user_id == current_user.id
            )
        ).first()

        if not settings:
            return UserSettingsResponse()

        return UserSettingsResponse(
            default_vcpus=settings.default_vcpus,
            default_mem=settings.default_mem,
            default_disk_size=settings.default_disk_size,
            default_os=settings.default_os,
            default_keyboard_layout=settings.default_keyboard_layout,
            timezone=settings.timezone,
        )


@router.put(
    "/settings",
    response_model=UserSettingsResponse,
    dependencies=[Depends(require_policy("auth:me:get"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
async def update_user_settings(
    data: UpdateUserSettingsRequest,
    current_user: UserORM = Depends(get_current_user),
):
    """Update the current user's settings."""
    with Session(engine) as session:
        settings = session.exec(
            select(UserSettingsORM).where(
                UserSettingsORM.user_id == current_user.id
            )
        ).first()

        if not settings:
            settings = UserSettingsORM(user_id=current_user.id)

        if data.default_vcpus is not None:
            settings.default_vcpus = data.default_vcpus if data.default_vcpus > 0 else None
        if data.default_mem is not None:
            settings.default_mem = data.default_mem if data.default_mem > 0 else None
        if data.default_disk_size is not None:
            settings.default_disk_size = data.default_disk_size if data.default_disk_size > 0 else None
        if data.default_os is not None:
            settings.default_os = data.default_os if data.default_os else None
        if data.default_keyboard_layout is not None:
            settings.default_keyboard_layout = (
                data.default_keyboard_layout if data.default_keyboard_layout else None
            )
        if data.timezone is not None:
            settings.timezone = data.timezone if data.timezone else "auto"

        session.add(settings)
        session.commit()
        session.refresh(settings)

        return UserSettingsResponse(
            default_vcpus=settings.default_vcpus,
            default_mem=settings.default_mem,
            default_disk_size=settings.default_disk_size,
            default_os=settings.default_os,
            default_keyboard_layout=settings.default_keyboard_layout,
            timezone=settings.timezone,
        )
