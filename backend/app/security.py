from datetime import timedelta

import bcrypt
import jwt

from .config import settings
from .models import Role
from .models.base import utcnow

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(user_id: int, active_role: Role) -> str:
    payload = {
        "sub": str(user_id),
        "role": active_role.value,
        "exp": utcnow() + timedelta(minutes=settings.jwt_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> tuple[int, Role]:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    return int(payload["sub"]), Role(payload["role"])
