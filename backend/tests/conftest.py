import pytest


@pytest.fixture(autouse=True)
def no_fixed_desktop_resolution(monkeypatch):
    """A developer's .env must not change the VM definitions under test."""
    monkeypatch.delenv("VITE_GLISS_RESOLUTION", raising=False)
