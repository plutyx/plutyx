from __future__ import annotations

import json
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .auth import current_user
from .db import Base, get_db
from .models import AuditLog, Membership, User, utcnow


router = APIRouter(tags=["operating-memory-v26"])

ALLOWED_NAMESPACES = {
    "system360",
    "playbook",
    "vitrine",
    "growth",
    "control-incidents",
    "control-contingency",
    "execution",
}
MAX_PAYLOAD_BYTES = 96 * 1024
_NAMESPACE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,47}$")


class BusinessMemory(Base):
    __tablename__ = "business_memories"
    __table_args__ = (
        UniqueConstraint("business_id", "namespace", name="uq_business_memory_namespace"),
        Index("ix_business_memories_business_updated", "business_id", "updated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    namespace: Mapped[str] = mapped_column(String(48))
    data_json: Mapped[str] = mapped_column(Text, default="{}")
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[Any] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[Any] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class BusinessMemoryRevision(Base):
    __tablename__ = "business_memory_revisions"
    __table_args__ = (
        UniqueConstraint("memory_id", "version", name="uq_business_memory_revision_version"),
        Index("ix_business_memory_revisions_business_namespace", "business_id", "namespace", "version"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    memory_id: Mapped[int] = mapped_column(ForeignKey("business_memories.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    namespace: Mapped[str] = mapped_column(String(48))
    version: Mapped[int] = mapped_column(Integer)
    data_json: Mapped[str] = mapped_column(Text)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[Any] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class MemoryWrite(BaseModel):
    data: Any = Field(default_factory=dict)
    expected_version: int | None = Field(default=None, ge=0)


def _member_or_403(db: Session, user: User, business_id: int) -> Membership:
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.business_id == business_id,
        )
    )
    if not membership:
        raise HTTPException(403, "Sem acesso a este negócio")
    return membership


def _validate_namespace(namespace: str) -> str:
    namespace = namespace.strip().lower()
    if namespace not in ALLOWED_NAMESPACES or not _NAMESPACE_RE.match(namespace):
        raise HTTPException(422, "Namespace de memória inválido")
    return namespace


def _encode_payload(data: Any) -> str:
    try:
        raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "Estado não serializável") from exc
    if len(raw.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(413, "Estado excede o limite de 96 KB")
    return raw


def _decode_payload(raw: str) -> Any:
    try:
        return json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}


def _snapshot(memory: BusinessMemory) -> dict[str, Any]:
    return {
        "namespace": memory.namespace,
        "data": _decode_payload(memory.data_json),
        "version": memory.version,
        "updated_at": memory.updated_at.isoformat() if memory.updated_at else None,
        "updated_by_user_id": memory.updated_by_user_id,
    }


@router.get("/businesses/{business_id}/memory")
def list_memory(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _member_or_403(db, user, business_id)
    rows = db.scalars(
        select(BusinessMemory)
        .where(BusinessMemory.business_id == business_id)
        .order_by(BusinessMemory.namespace)
    ).all()
    return {"business_id": business_id, "states": {row.namespace: _snapshot(row) for row in rows}}


@router.get("/businesses/{business_id}/memory/{namespace}")
def get_memory(
    business_id: int,
    namespace: str,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _member_or_403(db, user, business_id)
    namespace = _validate_namespace(namespace)
    memory = db.scalar(
        select(BusinessMemory).where(
            BusinessMemory.business_id == business_id,
            BusinessMemory.namespace == namespace,
        )
    )
    if not memory:
        return {"namespace": namespace, "data": {}, "version": 0, "updated_at": None, "updated_by_user_id": None}
    return _snapshot(memory)


@router.put("/businesses/{business_id}/memory/{namespace}")
def put_memory(
    business_id: int,
    namespace: str,
    data: MemoryWrite,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _member_or_403(db, user, business_id)
    namespace = _validate_namespace(namespace)
    raw = _encode_payload(data.data)
    memory = db.scalar(
        select(BusinessMemory).where(
            BusinessMemory.business_id == business_id,
            BusinessMemory.namespace == namespace,
        )
    )

    current_version = memory.version if memory else 0
    if data.expected_version is not None and data.expected_version != current_version:
        raise HTTPException(
            409,
            detail={
                "message": "Estado foi alterado por outra sessão",
                "current_version": current_version,
                "namespace": namespace,
            },
        )

    next_version = current_version + 1
    if memory is None:
        memory = BusinessMemory(
            business_id=business_id,
            namespace=namespace,
            data_json=raw,
            version=next_version,
            updated_by_user_id=user.id,
        )
        db.add(memory)
        db.flush()
    else:
        memory.data_json = raw
        memory.version = next_version
        memory.updated_by_user_id = user.id
        memory.updated_at = utcnow()
        db.flush()

    db.add(
        BusinessMemoryRevision(
            memory_id=memory.id,
            business_id=business_id,
            namespace=namespace,
            version=next_version,
            data_json=raw,
            actor_user_id=user.id,
        )
    )
    db.add(
        AuditLog(
            business_id=business_id,
            actor_user_id=user.id,
            action="business.memory.saved",
            entity_type="business_memory",
            entity_id=f"{namespace}:{memory.id}",
            payload_json=json.dumps(
                {
                    "namespace": namespace,
                    "version": next_version,
                    "payload_bytes": len(raw.encode("utf-8")),
                },
                ensure_ascii=False,
            ),
        )
    )
    db.commit()
    db.refresh(memory)
    return _snapshot(memory)


@router.get("/businesses/{business_id}/memory/{namespace}/history")
def memory_history(
    business_id: int,
    namespace: str,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=50),
):
    _member_or_403(db, user, business_id)
    namespace = _validate_namespace(namespace)
    rows = db.scalars(
        select(BusinessMemoryRevision)
        .where(
            BusinessMemoryRevision.business_id == business_id,
            BusinessMemoryRevision.namespace == namespace,
        )
        .order_by(BusinessMemoryRevision.version.desc())
        .limit(limit)
    ).all()
    return {
        "business_id": business_id,
        "namespace": namespace,
        "revisions": [
            {
                "version": row.version,
                "data": _decode_payload(row.data_json),
                "actor_user_id": row.actor_user_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
    }
