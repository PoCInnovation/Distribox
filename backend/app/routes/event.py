from fastapi import APIRouter, Depends, status

from app.models.event import (
    EventCreate, EventUpdate, EventRead,
    EventJoinRequest, EventJoinResponse,
)
from app.models.user_management import MissingPoliciesResponse
from app.services.event_service import EventService
from app.utils.auth import require_policy, get_current_user
from app.orm.user import UserORM

router = APIRouter()


@router.get(
    "/",
    status_code=status.HTTP_200_OK,
    response_model=list[EventRead],
    dependencies=[Depends(require_policy("events:get"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def list_events():
    return EventService.list_events()


@router.get(
    "/{event_id}",
    status_code=status.HTTP_200_OK,
    response_model=EventRead,
    dependencies=[Depends(require_policy("events:getById"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def get_event(event_id: str):
    return EventService.get_event(event_id)


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    response_model=EventRead,
    responses={403: {"model": MissingPoliciesResponse}},
)
def create_event(
    payload: EventCreate,
    current_user: UserORM = Depends(require_policy("events:create")),
):
    return EventService.create_event(payload, current_user.username)


@router.patch(
    "/{event_id}",
    status_code=status.HTTP_200_OK,
    response_model=EventRead,
    dependencies=[Depends(require_policy("events:update"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def update_event(event_id: str, payload: EventUpdate):
    return EventService.update_event(event_id, payload)


@router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_policy("events:delete"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def delete_event(event_id: str):
    EventService.delete_event(event_id)


@router.delete(
    "/{event_id}/vms/{vm_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_policy("events:delete"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def delete_event_vm(event_id: str, vm_id: str):
    EventService.delete_event_vm(event_id, vm_id)


# --- Public endpoint (no auth) ---

@router.get(
    "/public/{slug}",
    status_code=status.HTTP_200_OK,
    response_model=EventRead,
)
def get_public_event(slug: str):
    return EventService.get_event_by_slug(slug)


@router.post(
    "/public/{slug}/join",
    status_code=status.HTTP_201_CREATED,
    response_model=EventJoinResponse,
)
def join_event(slug: str, payload: EventJoinRequest):
    return EventService.join_event(slug, payload)
