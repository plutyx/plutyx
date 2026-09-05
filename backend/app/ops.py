from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from .auth import current_user
from .config import settings
from .db import get_db
from .market import member_or_403
from .models import AuditLog, Ingredient, Membership, Order, OrderItem, Product, RecipeItem, User
from .snapshots import OrderCompletionSnapshot


router = APIRouter(tags=["production-readiness-v10"])
RELEASE = "1.0.0"
REQUIRED_TABLES = {
    "users", "businesses", "memberships", "ingredients", "products", "recipe_items",
    "orders", "order_items", "customers", "purchases", "losses", "production_batches",
    "team_invites", "audit_logs", "outbox_events", "inventory_counts",
    "order_completion_snapshots", "order_recipe_snapshots",
    "user_security_states", "auth_action_tokens",
}


@router.get("/livez")
def livez():
    return {"ok": True, "service": "cozinha360-api", "release": RELEASE}


@router.get("/readyz")
def readyz(db: Annotated[Session, Depends(get_db)]):
    try:
        bind = db.get_bind()
        tables = set(inspect(bind).get_table_names())
        missing = sorted(REQUIRED_TABLES - tables)
        db.execute(select(func.count()).select_from(User)).scalar_one()
    except Exception as exc:
        detail = "Banco indisponível" if settings.environment.lower() == "production" else f"Banco indisponível: {exc}"
        raise HTTPException(503, detail) from exc
    if missing:
        detail = "Schema incompleto" if settings.environment.lower() == "production" else {"message": "Schema incompleto", "missing": missing}
        raise HTTPException(503, detail)
    return {
        "ok": True,
        "database": "reachable",
        "schema": "current",
        "release": RELEASE,
        "capabilities": {
            "transactional_email": settings.email_delivery_configured,
            "password_recovery": True,
            "email_verification": True,
        },
    }


@router.get("/businesses/{business_id}/data-quality")
def data_quality(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    member_or_403(db, user, business_id)
    ingredients = db.scalars(select(Ingredient).where(
        Ingredient.business_id == business_id,
        Ingredient.soft_deleted == False,
    )).all()
    products = db.scalars(select(Product).where(
        Product.business_id == business_id,
        Product.soft_deleted == False,
        Product.active == True,
    )).all()
    orders = db.scalars(select(Order).where(Order.business_id == business_id)).all()

    recipe_products = set(db.scalars(
        select(RecipeItem.product_id).join(Product, Product.id == RecipeItem.product_id).where(Product.business_id == business_id)
    ).all())
    item_orders = set(db.scalars(select(OrderItem.order_id).where(OrderItem.business_id == business_id)).all())
    snapped_orders = set(db.scalars(select(OrderCompletionSnapshot.order_id).where(
        OrderCompletionSnapshot.business_id == business_id
    )).all())

    issues = []
    missing_par = [x for x in ingredients if x.par_level_milliunits <= 0]
    if missing_par:
        issues.append({
            "code": "inventory_par_missing",
            "severity": "warning",
            "count": len(missing_par),
            "message": "Ingredientes sem estoque mínimo configurado não geram reposição útil.",
        })
    no_recipe = [x for x in products if x.id not in recipe_products]
    if no_recipe:
        issues.append({
            "code": "product_recipe_missing",
            "severity": "warning",
            "count": len(no_recipe),
            "message": "Produtos ativos sem ficha técnica não conseguem explicar custo nem consumo teórico.",
        })
    paid_without_items = [x for x in orders if x.paid and x.id not in item_orders]
    if paid_without_items:
        issues.append({
            "code": "paid_order_without_items",
            "severity": "critical",
            "count": len(paid_without_items),
            "message": "Pedidos pagos sem itens detalhados distorcem demanda, engenharia de cardápio e consumo teórico.",
        })
    negative_stock = [x for x in ingredients if x.on_hand_milliunits < 0]
    if negative_stock:
        issues.append({
            "code": "negative_stock",
            "severity": "critical",
            "count": len(negative_stock),
            "message": "Estoque negativo indica consumo não reconciliado ou contagem física pendente.",
        })
    legacy_completed = [x for x in orders if x.status == "completed" and x.id not in snapped_orders]
    if legacy_completed:
        issues.append({
            "code": "completed_order_without_recipe_snapshot",
            "severity": "warning",
            "count": len(legacy_completed),
            "message": "Pedidos concluídos antes dos snapshots de receita reduzem a precisão histórica da variação teórica de estoque.",
        })

    critical = sum(1 for x in issues if x["severity"] == "critical")
    warning = sum(1 for x in issues if x["severity"] == "warning")
    score = max(0, 100 - critical * 25 - warning * 10)
    return {
        "score": score,
        "status": "good" if score >= 90 else "attention" if score >= 60 else "critical",
        "issues": issues,
        "counts": {
            "ingredients": len(ingredients),
            "active_products": len(products),
            "orders": len(orders),
            "completed_orders_with_recipe_snapshot": len(snapped_orders),
        },
        "principle": "Dados incompletos geram decisões precisas sobre a coisa errada; corrija a base antes de automatizar mais.",
    }


@router.get("/businesses/{business_id}/audit")
def audit_log(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=100, ge=1, le=500),
):
    member_or_403(db, user, business_id, ("owner", "admin"))
    rows = db.scalars(select(AuditLog).where(
        AuditLog.business_id == business_id,
    ).order_by(AuditLog.created_at.desc()).limit(limit)).all()
    return [{
        "id": row.id,
        "actor_user_id": row.actor_user_id,
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "payload_json": row.payload_json,
        "created_at": row.created_at.isoformat(),
    } for row in rows]
