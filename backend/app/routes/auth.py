from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from app.core.config import engine
from app.core.policies import expand_policies
from app.models.user_management import MissingPoliciesResponse, UserResponse
from app.orm.user import UserORM
from app.utils.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_policy,
)

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
        user.password = password_data.new_password
        user.last_activity = datetime.utcnow()
        session.add(user)
        session.commit()

        return {"message": "Password changed successfully"}
