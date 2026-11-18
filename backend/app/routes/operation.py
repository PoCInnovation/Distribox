from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.models.operation import OperationRead
from app.orm.user import UserORM
from app.services.operation_service import OperationService
from app.utils.auth import get_current_user

router = APIRouter()

# Any signed-in user may ask: the service only returns the operations whose
# kind the user's policies cover, so the dashboard can poll for everyone.


@router.get(
    "/",
    status_code=status.HTTP_200_OK,
    response_model=list[OperationRead],
)
def list_operations(current_user: UserORM = Depends(get_current_user)):
    return OperationService.list_operations(current_user)


@router.get(
    "/{operation_id}",
    status_code=status.HTTP_200_OK,
    response_model=OperationRead,
)
def get_operation(operation_id: UUID,
                  current_user: UserORM = Depends(get_current_user)):
    return OperationService.get_operation(operation_id, current_user)


@router.delete(
    "/{operation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def dismiss_operation(operation_id: UUID,
                      current_user: UserORM = Depends(get_current_user)):
    OperationService.dismiss(operation_id, current_user)
