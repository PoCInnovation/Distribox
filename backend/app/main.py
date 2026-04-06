import asyncio
import logging
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from app.core.policies import DISTRIBOX_ADMIN_POLICY
from app.routes import vm, image, host, auth, user_management, tunnel, event, slave
from app.routes import slave_agent
from app.orm.user import UserORM
from app.orm.vm_credential import VmCredentialORM  # noqa: F401
from app.orm.event import EventORM, EventParticipantORM  # noqa: F401
from app.orm.user_settings import UserSettingsORM  # noqa: F401
from app.orm.slave import SlaveORM  # noqa: F401
from app.utils.auth import hash_password
from app.core.config import engine, get_env_or_default, init_db, DISTRIBOX_MODE, QEMUConfig
from app.utils.crypto import encrypt_secret, is_encrypted_secret
from app.services.vm_service import VmService

logger = logging.getLogger(__name__)

app = FastAPI()

frontend_url = get_env_or_default("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "PUT", "POST", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.on_event("shutdown")
async def shutdown_event():
    if DISTRIBOX_MODE != "slave":
        return

    _stop_all_local_vms()

    import httpx
    from app.core.config import MASTER_URL, SLAVE_API_KEY

    if not MASTER_URL or not SLAVE_API_KEY:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{MASTER_URL}/slaves/shutdown",
                headers={"X-Slave-Token": SLAVE_API_KEY},
            )
        logger.info("Shutdown notification sent to master")
    except Exception:
        logger.warning("Failed to notify master of shutdown")


def _stop_all_local_vms():
    try:
        conn = QEMUConfig.get_connection()
        domains = conn.listAllDomains(0)
        for domain in domains:
            if domain.isActive():
                try:
                    domain.destroy()
                    logger.info("Destroyed VM %s", domain.name())
                except Exception:
                    logger.warning("Failed to destroy VM %s", domain.name())
    except Exception:
        logger.warning("Failed to stop local VMs during shutdown")


@app.on_event("startup")
async def startup_event():
    init_db()

    if DISTRIBOX_MODE == "slave":
        logger.info("Starting in SLAVE mode")
        asyncio.create_task(_slave_heartbeat_loop())
        return

    admin_username = get_env_or_default("ADMIN_USERNAME", "admin")
    admin_password = get_env_or_default("ADMIN_PASSWORD", "admin")

    with Session(engine) as session:
        statement = select(UserORM).where(UserORM.username == admin_username)
        admin = session.exec(statement).first()

        if not admin:
            admin = UserORM(
                username=admin_username,
                hashed_password=hash_password(admin_password),
                password=encrypt_secret(admin_password),
                is_admin=True,
                created_by=admin_username,
                policies=[DISTRIBOX_ADMIN_POLICY],
            )
            session.add(admin)
            session.commit()
            logger.info("Created default admin user: %s", admin_username)
        else:
            should_save_admin = False
            if DISTRIBOX_ADMIN_POLICY not in admin.policies:
                admin.policies = [*admin.policies, DISTRIBOX_ADMIN_POLICY]
                admin.is_admin = True
                should_save_admin = True
            if not admin.password:
                admin.password = encrypt_secret(admin_password)
                should_save_admin = True
            elif not is_encrypted_secret(admin.password):
                admin.password = encrypt_secret(admin.password)
                should_save_admin = True
            if should_save_admin:
                session.add(admin)
                session.commit()
            logger.info("Admin user already exists: %s", admin_username)

        users = session.exec(
            select(UserORM).where(UserORM.password.is_not(None))
        ).all()
        migrated_usernames: list[str] = []
        for user in users:
            if user.password and not is_encrypted_secret(user.password):
                user.password = encrypt_secret(user.password)
                session.add(user)
                migrated_usernames.append(user.username)
        if migrated_usernames:
            session.commit()
            logger.info(
                "Encrypted plaintext passwords for users: %s",
                ", ".join(migrated_usernames),
            )

    asyncio.create_task(_enforce_event_deadlines())
    asyncio.create_task(_check_stale_slaves())
    logger.info("Starting in MASTER mode")


async def _enforce_event_deadlines():
    while True:
        try:
            with Session(engine) as session:
                expired_events = session.exec(
                    select(EventORM).where(
                        EventORM.deadline < datetime.utcnow())
                ).all()
                for ev in expired_events:
                    participants = session.exec(
                        select(EventParticipantORM)
                        .where(EventParticipantORM.event_id == ev.id)
                    ).all()
                    for p in participants:
                        try:
                            vm = await asyncio.to_thread(
                                VmService.get_vm, str(p.vm_id)
                            )
                            if vm and vm.state.lower() == "running":
                                await asyncio.to_thread(
                                    VmService.stop_vm, str(p.vm_id)
                                )
                                logger.info(
                                    "Stopped VM %s for expired event %s",
                                    p.vm_id, ev.slug,
                                )
                        except HTTPException:
                            pass
                        except Exception:
                            logger.exception(
                                "Failed to stop VM %s for event %s",
                                p.vm_id, ev.slug,
                            )
        except Exception:
            logger.exception("Error in deadline enforcement loop")
        await asyncio.sleep(30)


async def _check_stale_slaves():
    while True:
        try:
            from app.services.slave_service import SlaveService
            SlaveService.check_stale_slaves()
        except Exception:
            logger.exception("Error in stale slave check")
        await asyncio.sleep(30)


async def _slave_heartbeat_loop():
    import httpx
    from app.core.config import MASTER_URL, SLAVE_API_KEY
    from app.services.host_service import HostService
    import psutil

    if not MASTER_URL or not SLAVE_API_KEY:
        logger.warning(
            "MASTER_URL or SLAVE_API_KEY not set, skipping heartbeat"
        )
        return

    while True:
        try:
            host_info = HostService.get_host_info()
            mem = psutil.virtual_memory()
            heartbeat = {
                "total_cpu": psutil.cpu_count() or 0,
                "total_mem": round(mem.total / 2**30),
                "total_disk": round(host_info.disk.total),
                "available_cpu": round(
                    100.0 - host_info.cpu.percent_used_total, 2
                ),
                "available_mem": round(host_info.mem.available, 2),
                "available_disk": round(host_info.disk.available, 2),
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"{MASTER_URL}/slaves/heartbeat",
                    json=heartbeat,
                    headers={"X-Slave-Token": SLAVE_API_KEY},
                )
            logger.debug("Heartbeat sent to master")
        except Exception:
            logger.exception("Failed to send heartbeat to master")
        await asyncio.sleep(30)


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

if DISTRIBOX_MODE == "slave":
    app.include_router(slave_agent.router, tags=["slave-agent"])
else:
    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(user_management.router, tags=["users"])
    app.include_router(vm.router, prefix="/vms", tags=["vms"])
    app.include_router(image.router, prefix="/images", tags=["images"])
    app.include_router(host.router, prefix="/host", tags=["host"])
    app.include_router(tunnel.router, tags=["tunnel"])
    app.include_router(event.router, prefix="/events", tags=["events"])
    app.include_router(slave.router, prefix="/slaves", tags=["slaves"])
