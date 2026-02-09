import libvirt
from dotenv import load_dotenv
from os import getenv
from sqlmodel import create_engine, SQLModel
from app.telemetry.monitor import SystemMonitor

load_dotenv()


def get_env_or_default(key: str, default: str) -> str:
    """Get environment variable or return default if empty or None."""
    value = getenv(key)
    return value if value else default


db_name = get_env_or_default("POSTGRES_NAME", "distribox")
db_user = get_env_or_default("POSTGRES_USER", "distribox_user")
db_pass = get_env_or_default("POSTGRES_PASSWORD", "distribox_password")
db_port = get_env_or_default("POSTGRES_PORT", "5432")

database_url = f"postgresql+psycopg2://{db_user}:{db_pass}@localhost:{db_port}/{db_name}"
engine = create_engine(database_url, echo=True)


def init_db():
    """Initialize database tables."""
    SQLModel.metadata.create_all(engine)


class QEMUConfig:
    qemu_conn = None

    @classmethod
    def get_connection(cls):
        if cls.qemu_conn is None or cls.qemu_conn.isAlive() == 0:
            try:
                cls.qemu_conn = libvirt.open("qemu:///system")
            except libvirt.libvirtError:
                raise
        return cls.qemu_conn


system_monitor = SystemMonitor(interval=3,
                               get_connection=QEMUConfig.get_connection)
