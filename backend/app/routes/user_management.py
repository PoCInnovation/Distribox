from os import getenv
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.config import engine
from app.core.policies import (
    DISTRIBOX_ADMIN_POLICY,
    POLICIES,
    expand_policies,
    invalid_policies,
    normalize_policies,
)
from app.models.user_management import (
    CreateUserRequest,
    CreateUserResponse,
    MissingPoliciesResponse,
    PolicyResponse,
    UpdateUserPoliciesRequest,
    UserResponse,
)
from app.orm.user import UserORM
from app.utils.auth import get_current_user, hash_password, require_policy

router = APIRouter()


def to_user_response(user: UserORM) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        user=user.username,
        created_at=user.created_at,
        created_by=user.created_by,
        last_activity=user.last_activity,
        policies=[PolicyResponse(**policy)
                  for policy in expand_policies(user.policies)],
    )


@router.get(
    "/policies",
    response_model=list[PolicyResponse],
    dependencies=[Depends(require_policy("policies:get"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def get_policies():
    return [PolicyResponse(**entry) for entry in POLICIES]


@router.get(
    "/users",
    response_model=list[UserResponse],
    dependencies=[Depends(require_policy("users:get"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def list_users():
    with Session(engine) as session:
        statement = select(UserORM).order_by(UserORM.created_at)
        users = session.exec(statement).all()
        return [to_user_response(user) for user in users]


@router.post(
    "/users",
    response_model=CreateUserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_policy("users:create"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def create_user(
    payload: CreateUserRequest,
    current_user: UserORM = Depends(get_current_user),
):
    requested_policies = normalize_policies(payload.policies)
    invalid = invalid_policies(requested_policies)
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Invalid policies", "policies": invalid},
        )

    generated_password: Optional[str] = None
    password = payload.password
    if password is None:
        generated_password = str(uuid.uuid4())
        password = generated_password

    with Session(engine) as session:
        existing_user = session.exec(
            select(UserORM).where(UserORM.username == payload.user)
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists",
            )

        new_user = UserORM(
            username=payload.user,
            hashed_password=hash_password(password),
            is_admin=DISTRIBOX_ADMIN_POLICY in requested_policies,
            created_by=current_user.username,
            policies=requested_policies,
        )

        session.add(new_user)
        session.commit()
        session.refresh(new_user)

        return CreateUserResponse(
            **to_user_response(new_user).model_dump(),
            generated_password=generated_password,
        )


@router.post(
    "/users/{user_id}/policies",
    response_model=CreateUserResponse,
    dependencies=[Depends(require_policy("users:updatePolicies"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def update_user_policies(
    user_id: uuid.UUID,
    payload: UpdateUserPoliciesRequest,
):
    requested_policies = normalize_policies(payload.policies)
    invalid = invalid_policies(requested_policies)
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Invalid policies", "policies": invalid},
        )

    admin_username = getenv("ADMIN_USERNAME", "admin")

    with Session(engine) as session:
        target_user = session.get(UserORM, user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        if target_user.username == admin_username:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Default admin user policies cannot be updated",
            )

        if payload.user is not None and payload.user != target_user.username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Request user does not match target user",
            )

        generated_password: Optional[str] = None
        if "password" in payload.model_fields_set:
            password = payload.password
            if password is None:
                generated_password = str(uuid.uuid4())
                password = generated_password
            target_user.hashed_password = hash_password(password)

        target_user.policies = requested_policies
        target_user.is_admin = DISTRIBOX_ADMIN_POLICY in requested_policies
        session.add(target_user)
        session.commit()
        session.refresh(target_user)

        return CreateUserResponse(
            **to_user_response(target_user).model_dump(),
            generated_password=generated_password,
        )
