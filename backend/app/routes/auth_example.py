from fastapi import APIRouter, Depends
from supertokens_python.recipe.session import SessionContainer
from app.utils.auth import get_current_user

router = APIRouter()


@router.get("/me")
async def get_user_info(session: SessionContainer = Depends(get_current_user)):
    """
    Example protected endpoint that requires authentication.
    Returns the current user's ID.
    """
    user_id = session.get_user_id()
    return {
        "user_id": user_id,
        "session_handle": session.get_handle(),
    }


@router.get("/protected")
async def protected_route(session: SessionContainer = Depends(get_current_user)):
    """
    Another example of a protected endpoint.
    """
    return {
        "message": "This is a protected route",
        "user_id": session.get_user_id(),
    }
