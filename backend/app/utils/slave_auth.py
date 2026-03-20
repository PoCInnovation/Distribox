"""Authentication for slave-side API endpoints."""
from fastapi import Header, HTTPException, status
from app.core.config import SLAVE_API_KEY


def require_slave_token(x_slave_token: str = Header(...)) -> None:
    """Verify the X-Slave-Token header matches this slave's configured API key."""
    if not SLAVE_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Slave API key not configured",
        )
    if x_slave_token != SLAVE_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid slave token",
        )
