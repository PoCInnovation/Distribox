import libvirt
import boto3
from alembic import command
from alembic.config import Config as AlembicConfig
from botocore import UNSIGNED
from botocore.config import Config
from dotenv import load_dotenv
from os import getenv
from sqlmodel import create_engine
from app.telemetry.monitor import SystemMonitor
load_dotenv()


def get_env_or_default(key: str, default: str) -> str:
    """Get environment variable or return default if empty or None."""
    value = getenv(key)
    return value if value else default


distribox_bucket_registry = get_env_or_default(
    "DISTRIBOX_BUCKET_REGISTRY", "distribox-registry")
aws_region = get_env_or_default("AWS_REGION", "eu-west-3")

db_name = get_env_or_default("POSTGRES_NAME", "distribox")
db_user = get_env_or_default("POSTGRES_USER", "distribox_user")
db_pass = get_env_or_default("POSTGRES_PASSWORD", "distribox_password")
db_port = get_env_or_default("POSTGRES_PORT", "5432")
db_host = get_env_or_default("POSTGRES_HOST", "localhost")

database_url = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
engine = create_engine(database_url)

s3 = boto3.client(
    "s3",
    config=Config(signature_version=UNSIGNED),
    region_name=aws_region
)


def init_db():
    """Apply pending database migrations."""
    config = AlembicConfig()
    config.set_main_option("script_location", "app:migrations")
    command.upgrade(config, "head")


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

VNC_HOST = get_env_or_default("VNC_HOST", "127.0.0.1")
VNC_LISTEN = get_env_or_default("VNC_LISTEN", "127.0.0.1")

# Master/Slave mode: "master" (default) or "slave"
DISTRIBOX_MODE = get_env_or_default("DISTRIBOX_MODE", "master")

# Slave-specific config (only used when DISTRIBOX_MODE=slave)
MASTER_URL = get_env_or_default("MASTER_URL", "")
SLAVE_API_KEY = get_env_or_default("SLAVE_API_KEY", "")

# Virtualization type: "kvm" (default, hardware accel) or "qemu" (software emulation)
VIRT_TYPE = get_env_or_default("VIRT_TYPE", "kvm")

ROOT_PATH = get_env_or_default("ROOT_PATH", "")
