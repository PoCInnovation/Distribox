from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from app.routes import vm, image, host, auth
from app.orm.user import UserORM
from app.utils.auth import hash_password
from app.utils.auth import get_current_user, get_current_admin_user
from app.core.config import engine, get_env_or_default, init_db

app = FastAPI()

frontend_url = get_env_or_default("FRONTEND_URL", "http://localhost:3000")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "PUT", "POST", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize database and create default admin user if it doesn't exist."""
    init_db()  # This might be temporary

    admin_username = get_env_or_default("ADMIN_USERNAME", "admin")
    admin_password = get_env_or_default("ADMIN_PASSWORD", "admin")

    with Session(engine) as session:
        # Check if admin exists
        statement = select(UserORM).where(UserORM.username == admin_username)
        admin = session.exec(statement).first()

        if not admin:
            # Create admin user
            admin = UserORM(
                username=admin_username,
                hashed_password=hash_password(admin_password),
                is_admin=True
            )
            session.add(admin)
            session.commit()
            print(f"✓ Created default admin user: {admin_username}")
        else:
            print(f"✓ Admin user already exists: {admin_username}")


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(_, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(
    vm.router,
    prefix="/vms",
    tags=["vms"],
    dependencies=[
        Depends(get_current_admin_user)])
app.include_router(
    image.router,
    prefix="/images",
    tags=["images"],
    dependencies=[
        Depends(get_current_user)])
app.include_router(
    host.router,
    prefix="/host",
    tags=["host"],
    dependencies=[
        Depends(get_current_user)])
