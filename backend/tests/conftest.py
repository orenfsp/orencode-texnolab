import os
import tempfile
from pathlib import Path

import pytest

_tmp = Path(tempfile.mkdtemp()) / "test.db"
os.environ["FSP_DATABASE_URL"] = f"sqlite:///{_tmp.as_posix()}"

from fastapi.testclient import TestClient

from app import seed
from app.main import app


@pytest.fixture(scope="session")
def client():
    seed.main()
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def login(client):
    def _login(email: str, role: str | None = None) -> dict[str, str]:
        r = client.post("/api/auth/login", json={"email": email, "password": seed.PASSWORD})
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        if role and r.json()["active_role"] != role:
            r = client.post("/api/auth/switch-role", json={"role": role}, headers={"Authorization": f"Bearer {token}"})
            assert r.status_code == 200, r.text
            token = r.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _login
