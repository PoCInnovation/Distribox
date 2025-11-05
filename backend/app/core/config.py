import libvirt
from app.orm.vm import VmORM
from dotenv import load_dotenv
from os import getenv
from sqlmodel import create_engine, SQLModel

load_dotenv()
qemu_conn = libvirt.open("qemu:///system")

db_name = getenv("POSTGRES_NAME", "distribox")
db_user = getenv("POSTGRES_USER", "distribox_user")
db_pass = getenv("POSTGRES_PASSWORD", "distribox_password")
db_port = getenv("POSTGRES_PORT", "5432")

database_url = f"postgresql+psycopg2://{db_user}:{db_pass}@localhost:{db_port}/{db_name}"
engine = create_engine(database_url, echo=True)
SQLModel.metadata.create_all(engine)

class QEMUConfig:
    def get_connection():
        global qemu_conn
        if qemu_conn is None or qemu_conn.isAlive() == 0:
            try: 
                qemu_conn = libvirt.open("qemu:///system")
            except libvirt.libvirtError:
                raise
        return qemu_conn

