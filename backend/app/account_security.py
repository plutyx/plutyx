from __future__ import annotations

import hashlib
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .auth import current_user, hash_password
from .config import settings
from .db import Base, get_db
from .models import User, utcnow


log = logging.getLogger("cozinha360.account_security")
router = APIRouter(tags=["account-security-v10"])


class UserSecurityState(Base):
    __tablename__ = "user_security_states"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_security_state_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class AuthActionToken(Base):
    __tablename__ = "auth_action_tokens"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_auth_action_token_hash"),
        Index("ix_auth_action_tokens_user_purpose_created", "user_id", "purpose", "created_at"),
        Index("ix_auth_action_tokens_purpose_expires", "purpose", "expires_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(40), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    token: str = Field(min_length=20, max_length=300)
    new_password: str = Field(min_length=12, max_length=128)


class TokenConfirmIn(BaseModel):
    token: str = Field(min_length=20, max_length=300)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _security_state(db: Session, user_id: int) -> UserSecurityState:
    state = db.scalar(select(UserSecurityState).where(UserSecurityState.user_id == user_id))
    if state:
        return state
    state = UserSecurityState(user_id=user_id)
    db.add(state)
    db.flush()
    return state


def _revoke_active_tokens(db: Session, user_id: int, purpose: str) -> None:
    now = utcnow()
    rows = db.scalars(select(AuthActionToken).where(
        AuthActionToken.user_id == user_id,
        AuthActionToken.purpose == purpose,
        AuthActionToken.used_at.is_(None),
        AuthActionToken.revoked_at.is_(None),
    )).all()
    for row in rows:
        row.revoked_at = now


def _issue_token(db: Session, user_id: int, purpose: str, lifetime: timedelta) -> tuple[str, AuthActionToken]:
    _revoke_active_tokens(db, user_id, purpose)
    raw = secrets.token_urlsafe(32)
    row = AuthActionToken(
        user_id=user_id,
        purpose=purpose,
        token_hash=_token_hash(raw),
        expires_at=utcnow() + lifetime,
    )
    db.add(row)
    db.flush()
    return raw, row


def _consume_token(db: Session, raw: str, purpose: str) -> AuthActionToken:
    row = db.scalar(select(AuthActionToken).where(
        AuthActionToken.token_hash == _token_hash(raw),
        AuthActionToken.purpose == purpose,
    ))
    now = utcnow()
    if not row or row.used_at is not None or row.revoked_at is not None:
        raise HTTPException(410, "Link inválido ou já utilizado")
    expires = _aware(row.expires_at)
    if not expires or expires <= now:
        raise HTTPException(410, "Link expirado")
    row.used_at = now
    return row


def _email_link(kind: str, token: str) -> str:
    base = settings.public_app_url.rstrip("/") + "/"
    key = "verify_token" if kind == "verify_email" else "reset_token"
    return f"{base}?{urlencode({key: token})}"


def _send_smtp(to_email: str, subject: str, body: str) -> bool:
    if not settings.email_delivery_configured:
        return False
    msg = EmailMessage()
    msg["From"] = settings.smtp_from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(msg)
        return True
    except Exception:
        log.exception("transactional email delivery failed")
        return False


def _deliver_or_debug(user: User, purpose: str, raw: str) -> dict:
    link = _email_link(purpose, raw)
    if purpose == "verify_email":
        subject = "Confirme seu e-mail — Cozinha 360"
        body = (
            f"Olá {user.full_name or 'pessoa usuária'},\n\n"
            "Confirme seu e-mail para proteger sua conta no Cozinha 360:\n"
            f"{link}\n\nEste link expira em 24 horas."
        )
    else:
        subject = "Redefina sua senha — Cozinha 360"
        body = (
            f"Olá {user.full_name or 'pessoa usuária'},\n\n"
            "Recebemos uma solicitação para redefinir sua senha:\n"
            f"{link}\n\nEste link expira em 1 hora. Se não foi você, ignore esta mensagem."
        )

    delivered = _send_smtp(user.email, subject, body)
    result = {"delivery": "smtp" if delivered else "unavailable"}
    if settings.environment.lower() != "production" and not delivered:
        result.update({"delivery": "debug", "debug_token": raw, "debug_link": link})
    return result


@router.get("/auth/security-status")
def security_status(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    state = _security_state(db, user.id)
    db.commit()
    return {
        "email": user.email,
        "email_verified": state.email_verified_at is not None,
        "email_verified_at": state.email_verified_at.isoformat() if state.email_verified_at else None,
        "transactional_email_configured": settings.email_delivery_configured,
    }


@router.post("/auth/email-verification/request")
def request_email_verification(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    state = _security_state(db, user.id)
    if state.email_verified_at is not None:
        db.commit()
        return {"ok": True, "already_verified": True}

    raw, _ = _issue_token(db, user.id, "verify_email", timedelta(hours=24))
    delivery = _deliver_or_debug(user, "verify_email", raw)
    db.commit()
    return {"ok": True, "already_verified": False, **delivery}


@router.post("/auth/email-verification/confirm")
def confirm_email_verification(
    data: TokenConfirmIn,
    db: Annotated[Session, Depends(get_db)],
):
    token = _consume_token(db, data.token, "verify_email")
    state = _security_state(db, token.user_id)
    if state.email_verified_at is None:
        state.email_verified_at = utcnow()
    db.commit()
    return {"ok": True, "email_verified": True}


@router.post("/auth/password-reset/request")
def request_password_reset(
    data: PasswordResetRequestIn,
    db: Annotated[Session, Depends(get_db)],
):
    # The public response is intentionally generic to reduce account enumeration.
    generic = {
        "ok": True,
        "message": "Se houver uma conta elegível para este e-mail, as instruções de recuperação serão enviadas.",
        "transactional_email_configured": settings.email_delivery_configured,
    }
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if not user or not user.is_active:
        return generic

    raw, _ = _issue_token(db, user.id, "password_reset", timedelta(hours=1))
    delivery = _deliver_or_debug(user, "password_reset", raw)
    db.commit()
    if settings.environment.lower() != "production" and delivery.get("delivery") == "debug":
        return {**generic, **delivery}
    return generic


@router.post("/auth/password-reset/confirm")
def confirm_password_reset(
    data: PasswordResetConfirmIn,
    db: Annotated[Session, Depends(get_db)],
):
    token = _consume_token(db, data.token, "password_reset")
    user = db.get(User, token.user_id)
    if not user or not user.is_active:
        raise HTTPException(410, "Link inválido ou já utilizado")
    user.password_hash = hash_password(data.new_password)
    user.auth_version += 1
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    return {"ok": True, "sessions_revoked": True}
