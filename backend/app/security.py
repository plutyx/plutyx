from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .auth import create_token, current_user, hash_password, verify_password
from .db import get_db
from .models import AuditLog, Business, Ingredient, Membership, Product, RecipeItem, TeamInvite, User, utcnow

router = APIRouter(tags=["security-v07"])


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=128)


class InviteIn(BaseModel):
    role: str = "member"
    expires_hours: int = Field(default=72, ge=1, le=720)
    max_uses: int = Field(default=1, ge=1, le=20)


def aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def member_or_403(db: Session, user: User, business_id: int, roles: tuple[str, ...] = ("owner", "admin", "member")) -> Membership:
    membership = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.business_id == business_id))
    if not membership or membership.role not in roles:
        raise HTTPException(403, "Sem acesso a este negócio")
    return membership


def audit(db: Session, business_id: int, user_id: int, action: str, entity_type: str, entity_id: str, payload: dict | None = None) -> None:
    db.add(AuditLog(
        business_id=business_id,
        actor_user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload_json=json.dumps(payload or {}, ensure_ascii=False),
    ))


@router.post("/auth/login")
def secure_login(data: LoginIn, db: Annotated[Session, Depends(get_db)]):
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    # Mensagem genérica reduz enumeração de contas.
    if not user:
        raise HTTPException(401, "Credenciais inválidas")
    now = utcnow()
    locked_until = aware(user.locked_until)
    if locked_until and locked_until > now:
        retry = max(1, int((locked_until - now).total_seconds()))
        raise HTTPException(429, f"Muitas tentativas. Tente novamente em {retry} segundos")
    if not verify_password(data.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:
            user.locked_until = now + timedelta(minutes=15)
            user.failed_login_attempts = 0
        db.commit()
        raise HTTPException(401, "Credenciais inválidas")
    if not user.is_active:
        raise HTTPException(401, "Credenciais inválidas")
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    return {
        "access_token": create_token(user.id, user.email, user.auth_version),
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name},
    }


@router.post("/auth/logout-all")
def logout_all(user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    user.auth_version += 1
    db.commit()
    return {"ok": True, "sessions_revoked": True}


@router.post("/auth/change-password")
def change_password(data: ChangePasswordIn, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(401, "Senha atual inválida")
    if data.current_password == data.new_password:
        raise HTTPException(422, "A nova senha deve ser diferente")
    user.password_hash = hash_password(data.new_password)
    user.auth_version += 1
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    return {
        "ok": True,
        "access_token": create_token(user.id, user.email, user.auth_version),
        "token_type": "bearer",
    }


@router.post("/businesses/{business_id}/invites", status_code=201)
def create_invite(business_id: int, data: InviteIn, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    actor = member_or_403(db, user, business_id, ("owner", "admin"))
    role = data.role.lower().strip()
    if role not in {"admin", "member"}:
        raise HTTPException(422, "Papel inválido")
    if actor.role == "admin" and role != "member":
        raise HTTPException(403, "Admin só pode convidar membros")
    code = secrets.token_urlsafe(18)
    invite = TeamInvite(
        business_id=business_id,
        code=code,
        role=role,
        created_by_user_id=user.id,
        expires_at=utcnow() + timedelta(hours=data.expires_hours),
        max_uses=data.max_uses,
    )
    db.add(invite)
    db.flush()
    audit(db, business_id, user.id, "team_invite.created", "team_invite", str(invite.id), {"role": role, "max_uses": data.max_uses})
    db.commit()
    return {
        "id": invite.id,
        "code": invite.code,
        "role": invite.role,
        "expires_at": invite.expires_at.isoformat(),
        "max_uses": invite.max_uses,
        "uses": invite.uses,
        "share_path": f"/join/{invite.code}",
    }


@router.get("/businesses/{business_id}/invites")
def list_invites(business_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id, ("owner", "admin"))
    rows = db.scalars(select(TeamInvite).where(TeamInvite.business_id == business_id).order_by(TeamInvite.created_at.desc()).limit(100)).all()
    now = utcnow()
    return [{
        "id": x.id,
        "code": x.code,
        "role": x.role,
        "expires_at": x.expires_at.isoformat(),
        "max_uses": x.max_uses,
        "uses": x.uses,
        "revoked": x.revoked,
        "active": bool(not x.revoked and x.uses < x.max_uses and aware(x.expires_at) > now),
        "share_path": f"/join/{x.code}",
    } for x in rows]


@router.delete("/businesses/{business_id}/invites/{invite_id}")
def revoke_invite(business_id: int, invite_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id, ("owner", "admin"))
    invite = db.get(TeamInvite, invite_id)
    if not invite or invite.business_id != business_id:
        raise HTTPException(404, "Convite não encontrado")
    invite.revoked = True
    audit(db, business_id, user.id, "team_invite.revoked", "team_invite", str(invite.id))
    db.commit()
    return {"ok": True}


@router.post("/invites/{code}/accept", status_code=201)
def accept_invite(code: str, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    invite = db.scalar(select(TeamInvite).where(TeamInvite.code == code))
    if not invite or invite.revoked:
        raise HTTPException(404, "Convite inválido")
    now = utcnow()
    if aware(invite.expires_at) <= now:
        raise HTTPException(410, "Convite expirado")
    if invite.uses >= invite.max_uses:
        raise HTTPException(410, "Convite já utilizado")
    existing = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.business_id == invite.business_id))
    if existing:
        raise HTTPException(409, "Você já faz parte deste negócio")
    membership = Membership(user_id=user.id, business_id=invite.business_id, role=invite.role)
    db.add(membership)
    invite.uses += 1
    db.flush()
    audit(db, invite.business_id, user.id, "team_invite.accepted", "membership", str(membership.id), {"invite_id": invite.id, "role": invite.role})
    db.commit()
    business = db.get(Business, invite.business_id)
    return {"business_id": business.id, "business_name": business.name, "role": membership.role}


@router.get("/businesses/{business_id}/catalog/availability")
def catalog_availability(business_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id)
    products = db.scalars(select(Product).where(Product.business_id == business_id, Product.soft_deleted == False).order_by(Product.name)).all()
    result = []
    for product in products:
        if not product.active:
            result.append({"product_id": product.id, "product_name": product.name, "status": "disabled", "max_units": 0, "limiting_ingredient": None})
            continue
        recipe = db.scalars(select(RecipeItem).where(RecipeItem.product_id == product.id)).all()
        if not recipe:
            result.append({"product_id": product.id, "product_name": product.name, "status": "unknown", "max_units": None, "limiting_ingredient": None})
            continue
        candidates = []
        for item in recipe:
            ingredient = db.get(Ingredient, item.ingredient_id)
            if not ingredient or ingredient.business_id != business_id or item.qty_used_milliunits <= 0:
                continue
            units = max(0, ingredient.on_hand_milliunits // item.qty_used_milliunits)
            candidates.append((units, ingredient.name))
        if not candidates:
            status, max_units, limiting = "unknown", None, None
        else:
            max_units, limiting = min(candidates, key=lambda x: x[0])
            status = "sold_out" if max_units == 0 else "low" if max_units <= max(1, product.units_per_batch) else "available"
        result.append({
            "product_id": product.id,
            "product_name": product.name,
            "status": status,
            "max_units": max_units,
            "limiting_ingredient": limiting,
        })
    return {"products": result}
