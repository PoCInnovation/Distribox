import subprocess
import tempfile
from pathlib import Path

from fastapi import HTTPException, status

from app.core.constants import IMAGES_DIR


def _resolve_seed_config_dir() -> Path:
    seed_config_dir = Path(__file__).resolve().parents[1] / "assets" / "seed-config"
    user_data = seed_config_dir / "user-data"
    meta_data = seed_config_dir / "meta-data"
    if user_data.exists() and meta_data.exists():
        return seed_config_dir

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Missing seed-config templates (expected app/assets/seed-config)",
    )


def ensure_seed_iso() -> Path:
    seed_iso_path = IMAGES_DIR / "seed.iso"
    if seed_iso_path.exists():
        return seed_iso_path

    seed_config_dir = _resolve_seed_config_dir()
    user_data_path = seed_config_dir / "user-data"
    meta_data_path = seed_config_dir / "meta-data"

    seed_iso_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = Path(temp_dir)
        temp_user_data_path = temp_dir_path / "user-data"
        temp_meta_data_path = temp_dir_path / "meta-data"
        temp_user_data_path.write_text(user_data_path.read_text())
        temp_meta_data_path.write_text(meta_data_path.read_text())

        try:
            subprocess.run(
                [
                    "genisoimage",
                    "-output",
                    str(seed_iso_path),
                    "-volid",
                    "cidata",
                    "-joliet",
                    "-rock",
                    str(temp_user_data_path),
                    str(temp_meta_data_path),
                ],
                capture_output=True,
                text=True,
                check=True,
            )
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="genisoimage is required to create seed.iso but was not found",
            ) from exc
        except subprocess.CalledProcessError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create seed.iso: {exc.stderr.strip()}",
            ) from exc

    return seed_iso_path
