from fastapi import Depends, HTTPException
from supertokens_python.recipe.session.framework.fastapi import verify_session
from supertokens_python.recipe.session import SessionContainer


async def get_current_user(session: SessionContainer = Depends(verify_session())):
    """
    Dependency to get the current authenticated user.
    Use this in your route handlers to protect endpoints.
    
    Example:
        @router.get("/protected")
        async def protected_route(user: SessionContainer = Depends(get_current_user)):
            user_id = user.get_user_id()
            return {"user_id": user_id}
    """
    return session
