from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from sqlmodel import Session, select
from app.core.config import engine
from app.orm.user import UserORM
from app.utils.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    get_current_admin_user
)
import uuid

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    username: str
    is_admin: bool


@router.post("/login", response_model=TokenResponse)
async def login(login_data: LoginRequest):
    """Login endpoint that returns a JWT token."""
    with Session(engine) as session:
        statement = select(UserORM).where(UserORM.username == login_data.username)
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
            data={"sub": str(user.id), "username": user.username, "is_admin": user.is_admin}
        )

        return TokenResponse(access_token=access_token)


@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: CreateUserRequest,
    current_admin: UserORM = Depends(get_current_admin_user)
):
    """Create a new user. Only admins can create users."""
    with Session(engine) as session:
        statement = select(UserORM).where(UserORM.username == user_data.username)
        existing_user = session.exec(statement).first()

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists"
            )

        hashed_password = hash_password(user_data.password)
        new_user = UserORM(
            username=user_data.username,
            hashed_password=hashed_password,
            is_admin=user_data.is_admin
        )

        session.add(new_user)
        session.commit()
        session.refresh(new_user)

        return UserResponse(
            id=str(new_user.id),
            username=new_user.username,
            is_admin=new_user.is_admin
        )


@router.get("/users", response_model=list[UserResponse])
async def list_users(current_admin: UserORM = Depends(get_current_admin_user)):
    """List all users. Only admins can view users."""
    with Session(engine) as session:
        statement = select(UserORM)
        users = session.exec(statement).all()

        return [
            UserResponse(
                id=str(user.id),
                username=user.username,
                is_admin=user.is_admin
            )
            for user in users
        ]


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserORM = Depends(get_current_user)):
    """Get information about the currently logged-in user."""
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        is_admin=current_user.is_admin
    )


@router.post("/change-password")
async def change_password(
    password_data: ChangePasswordRequest,
    current_user: UserORM = Depends(get_current_user)
):
    """Change the current user's password."""
    with Session(engine) as session:
        if not verify_password(password_data.current_password, current_user.hashed_password):
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
        session.add(user)
        session.commit()

        return {"message": "Password changed successfully"}
