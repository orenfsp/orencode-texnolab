from typing import Any

from sqlalchemy.orm import Session

from ..deps import Principal
from ..models import AuditLog


def log_action(
    db: Session,
    who: Principal | None,
    action: str,
    entity: str,
    entity_id: int | None = None,
    **details: Any,
) -> None:
    db.add(
        AuditLog(
            user_id=who.id if who else None,
            role=who.role if who else None,
            action=action,
            entity=entity,
            entity_id=entity_id,
            details=details or None,
        )
    )
