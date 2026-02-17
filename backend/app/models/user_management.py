from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class PolicyResponse(BaseModel):
    policy: str
    description: str


class MissingPoliciesDetail(BaseModel):
    message: str
    missing_policies: list[str]


class MissingPoliciesResponse(BaseModel):
    detail: MissingPoliciesDetail


class UserResponse(BaseModel):
    id: str
    user: str
    created_at: datetime
    created_by: Optional[str]
    last_activity: Optional[datetime]
    policies: list[PolicyResponse]


class CreateUserRequest(BaseModel):
    user: str
    password: Optional[str] = None
    policies: list[str] = Field(default_factory=list)


class CreateUserResponse(UserResponse):
    generated_password: Optional[str] = None


class UpdateUserPoliciesRequest(BaseModel):
    user: Optional[str] = None
    password: Optional[str] = None
    policies: list[str]
