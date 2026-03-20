"""Master-side routes for managing slave nodes."""
from fastapi import APIRouter, Depends, Header, HTTPException, status
from app.models.slave import SlaveCreate, SlaveRead, SlaveHeartbeat
from app.models.user_management import MissingPoliciesResponse
from app.services.slave_service import SlaveService
from app.utils.auth import require_policy
from app.orm.slave import SlaveORM
from app.core.config import engine
from sqlmodel import Session, select

router = APIRouter()


def _verify_slave_token(
    x_slave_token: str = Header(...),
) -> SlaveORM:
    """Verify that the X-Slave-Token header matches a registered slave."""
    with Session(engine) as session:
        slave = session.exec(
            select(SlaveORM).where(SlaveORM.api_key == x_slave_token)
        ).first()
        if not slave:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid slave token",
            )
        return slave


@router.get(
    "/",
    status_code=status.HTTP_200_OK,
    response_model=list[SlaveRead],
    dependencies=[Depends(require_policy("slaves:get"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def list_slaves():
    return SlaveService.list_slaves()


@router.get(
    "/{slave_id}",
    status_code=status.HTTP_200_OK,
    response_model=SlaveRead,
    dependencies=[Depends(require_policy("slaves:getById"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def get_slave(slave_id: str):
    return SlaveService.get_slave(slave_id)


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    response_model=SlaveRead,
    dependencies=[Depends(require_policy("slaves:create"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def create_slave(payload: SlaveCreate):
    return SlaveService.create_slave(payload)


@router.delete(
    "/{slave_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_policy("slaves:delete"))],
    responses={403: {"model": MissingPoliciesResponse}},
)
def delete_slave(slave_id: str):
    SlaveService.delete_slave(slave_id)


@router.post(
    "/heartbeat",
    status_code=status.HTTP_200_OK,
    response_model=SlaveRead,
)
def slave_heartbeat(
    heartbeat: SlaveHeartbeat,
    slave: SlaveORM = Depends(_verify_slave_token),
):
    """Receive a heartbeat from a slave node (authenticated via X-Slave-Token)."""
    return SlaveService.handle_heartbeat(str(slave.id), heartbeat)
