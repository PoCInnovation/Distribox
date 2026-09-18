import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, status

from app.core.constants import IMAGES_DIR


LAYOUT_TO_XKB = {
    "en-us-qwerty": "us",
    "en-gb-qwerty": "gb",
    "fr-fr-azerty": "fr",
    "fr-be-azerty": "be",
    "fr-ch-qwertz": "ch",
    "de-de-qwertz": "de",
    "de-ch-qwertz": "ch",
    "es-es-qwerty": "es",
    "es-latam-qwerty": "latam",
    "it-it-qwerty": "it",
    "pt-br-qwerty": "br",
    "pt-pt-qwerty": "pt",
    "nl-nl-qwerty": "nl",
    "sv-se-qwerty": "se",
    "da-dk-qwerty": "dk",
    "nb-no-qwerty": "no",
    "fi-fi-qwerty": "fi",
    "pl-pl-qwerty": "pl",
    "cs-cz-qwertz": "cz",
    "hu-hu-qwertz": "hu",
    "ro-ro-qwerty": "ro",
    "ru-ru-qwerty": "ru",
    "ja-jp-qwerty": "jp",
    "ko-kr-qwerty": "kr",
    "tr-tr-qwerty": "tr",
}

LAYOUT_TO_XKB_VARIANT = {
    "fr-ch-qwertz": "fr",
    "de-ch-qwertz": "de",
}


def _resolve_seed_config_dir() -> Path:
    seed_config_dir = Path(__file__).resolve(
    ).parents[1] / "assets" / "seed-config"
    user_data = seed_config_dir / "user-data"
    meta_data = seed_config_dir / "meta-data"
    if user_data.exists() and meta_data.exists():
        return seed_config_dir

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Missing seed-config templates (expected app/assets/seed-config)",
    )


def _build_user_data(base_text: str, keyboard_layout: Optional[str]) -> str:
    if not keyboard_layout:
        return base_text

    xkb_layout = LAYOUT_TO_XKB.get(keyboard_layout)
    if not xkb_layout:
        return base_text

    xkb_variant = LAYOUT_TO_XKB_VARIANT.get(keyboard_layout, "")

    keyboard_block = f"\nkeyboard:\n  layout: {xkb_layout}\n"
    if xkb_variant:
        keyboard_block += f"  variant: {xkb_variant}\n"

    return base_text.rstrip() + "\n" + keyboard_block


def _generate_seed_iso(
    output_path: Path,
    keyboard_layout: Optional[str] = None,
) -> Path:
    seed_config_dir = _resolve_seed_config_dir()
    user_data_path = seed_config_dir / "user-data"
    meta_data_path = seed_config_dir / "meta-data"

    output_path.parent.mkdir(parents=True, exist_ok=True)

    base_user_data = user_data_path.read_text()
    final_user_data = _build_user_data(base_user_data, keyboard_layout)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = Path(temp_dir)
        temp_user_data_path = temp_dir_path / "user-data"
        temp_meta_data_path = temp_dir_path / "meta-data"
        temp_user_data_path.write_text(final_user_data)
        temp_meta_data_path.write_text(meta_data_path.read_text())

        try:
            subprocess.run(
                [
                    "genisoimage",
                    "-output",
                    str(output_path),
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

    return output_path


def ensure_seed_iso(
    keyboard_layout: Optional[str] = None,
    vm_dir: Optional[Path] = None,
) -> Path:
    if vm_dir:
        seed_iso_path = vm_dir / "seed.iso"
        if seed_iso_path.exists() and not keyboard_layout:
            return seed_iso_path
        return _generate_seed_iso(seed_iso_path, keyboard_layout)

    seed_iso_path = IMAGES_DIR / "seed.iso"
    if seed_iso_path.exists():
        return seed_iso_path

    return _generate_seed_iso(seed_iso_path)
