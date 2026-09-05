from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .auth import current_user
from .db import get_db
from .models import (
    AuditLog,
    Business,
    Customer,
    Ingredient,
    Loss,
    Membership,
    Order,
    OrderItem,
    OutboxEvent,
    Product,
    ProductionBatch,
    Purchase,
    RecipeItem,
    User,
    utcnow,
)

router = APIRouter(tags=["market-v06"])

MODULES = ["hoje", "pedidos", "producao", "produtos", "custos", "financeiro", "clientes", "equipe", "config"]
WIDGETS = ["decision", "sales", "contribution", "losses", "open_orders", "inventory_alerts", "production", "demand"]


class WorkspacePreferencesIn(BaseModel):
    hidden_modules: list[str] = Field(default_factory=list)
    module_order: list[str] = Field(default_factory=lambda: MODULES.copy())
    home_focus: str = "margin"
    home_widgets: list[str] = Field(default_factory=lambda: ["decision", "sales", "contribution", "open_orders", "inventory_alerts"])
    compact_mode: bool = True
    role_view: str = "all"
    default_product_id: int | None = None
    theme: str = "system"


class MemberAddIn(BaseModel):
    email: EmailStr
    role: str = "member"


class InventoryConfigIn(BaseModel):
    on_hand_milliunits: int = Field(ge=-1000000000)
    par_level_milliunits: int = Field(ge=0)
    reorder_target_milliunits: int = Field(ge=0)
    expected_version: int = Field(ge=1)


class RecipeItemIn(BaseModel):
    ingredient_id: int
    qty_used_milliunits: int = Field(gt=0)


class OrderItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=10000)
    unit_price_cents: int = Field(ge=0)
    unit_variable_cost_cents: int = Field(ge=0)


class ProductionBatchIn(BaseModel):
    product_id: int
    planned_qty: int = Field(ge=0, le=1000000)
    scheduled_for: datetime | None = None
    responsible_user_id: int | None = None
    notes: str = Field(default="", max_length=2000)


class ProductionBatchUpdateIn(BaseModel):
    status: str
    produced_qty: int = Field(ge=0, le=1000000)
    waste_qty: int = Field(ge=0, le=1000000)
    expected_version: int = Field(ge=1)
    notes: str | None = Field(default=None, max_length=2000)


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


def safe_preferences(membership: Membership) -> dict:
    try:
        raw = json.loads(membership.preferences_json or "{}")
    except json.JSONDecodeError:
        raw = {}
    defaults = WorkspacePreferencesIn().model_dump()
    defaults.update({k: v for k, v in raw.items() if k in defaults})
    defaults["hidden_modules"] = [x for x in defaults.get("hidden_modules", []) if x in MODULES]
    order = [x for x in defaults.get("module_order", []) if x in MODULES]
    defaults["module_order"] = order + [x for x in MODULES if x not in order]
    defaults["home_widgets"] = [x for x in defaults.get("home_widgets", []) if x in WIDGETS]
    if defaults.get("theme") not in {"system", "light", "dark"}:
        defaults["theme"] = "system"
    if defaults.get("role_view") not in {"all", "operations", "finance", "sales"}:
        defaults["role_view"] = "all"
    return defaults


def inventory_alert_rows(db: Session, business_id: int) -> list[dict]:
    ingredients = db.scalars(select(Ingredient).where(
        Ingredient.business_id == business_id,
        Ingredient.soft_deleted == False,
    ).order_by(Ingredient.name)).all()
    rows = []
    for ing in ingredients:
        if ing.par_level_milliunits > 0 and ing.on_hand_milliunits <= ing.par_level_milliunits:
            target = max(ing.reorder_target_milliunits, ing.par_level_milliunits)
            rows.append({
                "ingredient_id": ing.id,
                "name": ing.name,
                "unit": ing.unit,
                "on_hand_milliunits": ing.on_hand_milliunits,
                "par_level_milliunits": ing.par_level_milliunits,
                "reorder_target_milliunits": target,
                "suggested_purchase_milliunits": max(0, target - ing.on_hand_milliunits),
                "severity": "critical" if ing.on_hand_milliunits <= 0 else "warning",
            })
    return rows


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def finance_summary(db: Session, business_id: int, days: int) -> dict:
    start = utcnow() - timedelta(days=days)
    paid = db.scalars(select(Order).where(Order.business_id == business_id, Order.paid == True)).all()
    paid = [o for o in paid if _aware(o.created_at) >= start]
    losses = db.scalars(select(Loss).where(Loss.business_id == business_id)).all()
    losses = [x for x in losses if _aware(x.created_at) >= start]
    purchases = db.scalars(select(Purchase).where(Purchase.business_id == business_id)).all()
    purchases = [x for x in purchases if _aware(x.created_at) >= start]
    revenue = sum(x.total_cents for x in paid)
    variable = sum(x.variable_cost_cents for x in paid)
    contribution = sum(x.contribution_cents for x in paid)
    loss = sum(x.estimated_cost_cents for x in losses)
    landed = sum(x.total_cents + x.freight_cents + x.tax_cents for x in purchases)
    return {
        "period_days": days,
        "revenue_cents": revenue,
        "variable_costs_cents": variable,
        "contribution_cents": contribution,
        "contribution_margin_bps": round(contribution * 10000 / revenue) if revenue else 0,
        "loss_cents": loss,
        "purchases_landed_cents": landed,
        "order_count": len(paid),
    }


def consume_order_inventory(db: Session, business_id: int, order_id: int) -> dict:
    order = db.get(Order, order_id)
    if not order or order.business_id != business_id:
        raise HTTPException(404, "Pedido não encontrado")
    if order.inventory_consumed:
        return {"consumed": False, "replay": True, "ingredients": []}
    items = db.scalars(select(OrderItem).where(OrderItem.business_id == business_id, OrderItem.order_id == order_id)).all()
    consumed: dict[int, int] = {}
    for item in items:
        recipe = db.scalars(select(RecipeItem).where(RecipeItem.product_id == item.product_id)).all()
        for recipe_item in recipe:
            ing = db.get(Ingredient, recipe_item.ingredient_id)
            if not ing or ing.business_id != business_id:
                continue
            qty = recipe_item.qty_used_milliunits * item.quantity
            ing.on_hand_milliunits -= qty
            ing.version += 1
            consumed[ing.id] = consumed.get(ing.id, 0) + qty
    order.inventory_consumed = True
    alerts = inventory_alert_rows(db, business_id)
    for row in alerts:
        db.add(OutboxEvent(
            business_id=business_id,
            topic="inventory.low",
            payload_json=json.dumps(row, ensure_ascii=False),
        ))
    return {
        "consumed": True,
        "replay": False,
        "ingredients": [{"ingredient_id": ingredient_id, "qty_milliunits": qty} for ingredient_id, qty in consumed.items()],
        "alerts": alerts,
    }


@router.get("/businesses/{business_id}/workspace")
def workspace(business_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    membership = member_or_403(db, user, business_id)
    prefs = safe_preferences(membership)
    hidden = set(prefs["hidden_modules"])
    allowed = [m for m in prefs["module_order"] if m not in hidden]
    if membership.role == "member" and "equipe" in allowed:
        allowed.remove("equipe")
    business = db.get(Business, business_id)
    open_orders = db.scalar(select(func.count(Order.id)).where(
        Order.business_id == business_id,
        Order.status.notin_(("completed", "cancelled")),
    )) or 0
    planned_batches = db.scalar(select(func.count(ProductionBatch.id)).where(
        ProductionBatch.business_id == business_id,
        ProductionBatch.status.in_(("planned", "in_progress")),
    )) or 0
    return {
        "business": {"id": business.id, "name": business.name, "city": business.city, "currency": business.currency},
        "member": {"user_id": user.id, "name": user.full_name, "email": user.email, "role": membership.role},
        "preferences": prefs,
        "modules": allowed,
        "summary": {
            "open_orders": open_orders,
            "production_batches": planned_batches,
            "inventory_alerts": len(inventory_alert_rows(db, business_id)),
            "finance_30d": finance_summary(db, business_id, 30),
        },
    }


@router.put("/businesses/{business_id}/workspace/preferences")
def update_workspace_preferences(business_id: int, data: WorkspacePreferencesIn, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    membership = member_or_403(db, user, business_id)
    cleaned = safe_preferences(type("P", (), {"preferences_json": json.dumps(data.model_dump())})())
    membership.preferences_json = json.dumps(cleaned, ensure_ascii=False)
    audit(db, business_id, user.id, "member.workspace_preferences", "membership", str(membership.id), cleaned)
    db.commit()
    return cleaned


@router.get("/businesses/{business_id}/members")
def list_members(business_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id, ("owner", "admin"))
    rows = db.execute(select(Membership, User).join(User, User.id == Membership.user_id).where(Membership.business_id == business_id)).all()
    return [{
        "membership_id": m.id,
        "user_id": u.id,
        "name": u.full_name,
        "email": u.email,
        "role": m.role,
        "preferences": safe_preferences(m),
    } for m, u in rows]


@router.post("/businesses/{business_id}/members", status_code=201)
def add_member(business_id: int, data: MemberAddIn, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    actor = member_or_403(db, user, business_id, ("owner", "admin"))
    role = data.role.lower().strip()
    if role not in {"admin", "member"}:
        raise HTTPException(422, "Papel inválido")
    if actor.role == "admin" and role != "member":
        raise HTTPException(403, "Admin só pode adicionar membros")
    target = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if not target:
        raise HTTPException(404, "A conta deste membro ainda não existe")
    existing = db.scalar(select(Membership).where(Membership.user_id == target.id, Membership.business_id == business_id))
    if existing:
        raise HTTPException(409, "Usuário já faz parte deste negócio")
    membership = Membership(user_id=target.id, business_id=business_id, role=role)
    db.add(membership)
    db.flush()
    audit(db, business_id, user.id, "member.added", "membership", str(membership.id), {"user_id": target.id, "role": role})
    db.commit()
    return {"membership_id": membership.id, "user_id": target.id, "email": target.email, "role": role}


@router.patch("/businesses/{business_id}/ingredients/{ingredient_id}/inventory")
def configure_inventory(business_id: int, ingredient_id: int, data: InventoryConfigIn, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id, ("owner", "admin"))
    ing = db.get(Ingredient, ingredient_id)
    if not ing or ing.business_id != business_id:
        raise HTTPException(404, "Ingrediente não encontrado")
    if ing.version != data.expected_version:
        raise HTTPException(409, "Ingrediente foi alterado por outra sessão")
    ing.on_hand_milliunits = data.on_hand_milliunits
    ing.par_level_milliunits = data.par_level_milliunits
    ing.reorder_target_milliunits = max(data.reorder_target_milliunits, data.par_level_milliunits)
    ing.version += 1
    audit(db, business_id, user.id, "ingredient.inventory_configured", "ingredient", str(ing.id), data.model_dump())
    db.commit()
    return {
        "id": ing.id,
        "on_hand_milliunits": ing.on_hand_milliunits,
        "par_level_milliunits": ing.par_level_milliunits,
        "reorder_target_milliunits": ing.reorder_target_milliunits,
        "version": ing.version,
    }


@router.get("/businesses/{business_id}/inventory/alerts")
def inventory_alerts(business_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id)
    return inventory_alert_rows(db, business_id)


@router.put("/businesses/{business_id}/products/{product_id}/recipe/{ingredient_id}")
def upsert_recipe_item(business_id: int, product_id: int, ingredient_id: int, data: RecipeItemIn, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id, ("owner", "admin"))
    if data.ingredient_id != ingredient_id:
        raise HTTPException(422, "ingredient_id divergente")
    product = db.get(Product, product_id)
    ingredient = db.get(Ingredient, ingredient_id)
    if not product or product.business_id != business_id:
        raise HTTPException(404, "Produto não encontrado")
    if not ingredient or ingredient.business_id != business_id:
        raise HTTPException(404, "Ingrediente não encontrado")
    item = db.scalar(select(RecipeItem).where(RecipeItem.product_id == product_id, RecipeItem.ingredient_id == ingredient_id))
    if item:
        item.qty_used_milliunits = data.qty_used_milliunits
    else:
        item = RecipeItem(product_id=product_id, ingredient_id=ingredient_id, qty_used_milliunits=data.qty_used_milliunits)
        db.add(item)
    db.flush()
    audit(db, business_id, user.id, "recipe.item_upserted", "recipe_item", str(item.id), data.model_dump())
    db.commit()
    return {"id": item.id, "product_id": product_id, "ingredient_id": ingredient_id, "qty_used_milliunits": item.qty_used_milliunits}


@router.get("/businesses/{business_id}/products/{product_id}/recipe")
def get_recipe(business_id: int, product_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id)
    product = db.get(Product, product_id)
    if not product or product.business_id != business_id:
        raise HTTPException(404, "Produto não encontrado")
    rows = db.execute(select(RecipeItem, Ingredient).join(Ingredient, Ingredient.id == RecipeItem.ingredient_id).where(RecipeItem.product_id == product_id)).all()
    items = []
    total = 0
    for recipe_item, ing in rows:
        unit_cost = round(ing.last_purchase_price_cents * recipe_item.qty_used_milliunits / max(1, ing.usable_qty_milliunits))
        total += unit_cost
        items.append({
            "ingredient_id": ing.id,
            "name": ing.name,
            "qty_used_milliunits": recipe_item.qty_used_milliunits,
            "estimated_cost_cents": unit_cost,
            "on_hand_milliunits": ing.on_hand_milliunits,
        })
    return {"product_id": product.id, "product_name": product.name, "ingredient_cost_cents": total, "items": items}


@router.post("/businesses/{business_id}/orders/{order_id}/items", status_code=201)
def add_order_item(business_id: int, order_id: int, data: OrderItemIn, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id)
    order = db.get(Order, order_id)
    product = db.get(Product, data.product_id)
    if not order or order.business_id != business_id:
        raise HTTPException(404, "Pedido não encontrado")
    if order.inventory_consumed or order.status in {"completed", "cancelled"}:
        raise HTTPException(409, "Pedido já encerrado")
    if not product or product.business_id != business_id or product.soft_deleted:
        raise HTTPException(404, "Produto não encontrado")
    item = OrderItem(business_id=business_id, order_id=order_id, **data.model_dump())
    db.add(item)
    db.flush()
    audit(db, business_id, user.id, "order.item_added", "order_item", str(item.id), data.model_dump())
    db.commit()
    return {"id": item.id, **data.model_dump()}


@router.get("/businesses/{business_id}/orders/{order_id}/items")
def list_order_items(business_id: int, order_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id)
    order = db.get(Order, order_id)
    if not order or order.business_id != business_id:
        raise HTTPException(404, "Pedido não encontrado")
    rows = db.execute(select(OrderItem, Product).join(Product, Product.id == OrderItem.product_id).where(OrderItem.order_id == order_id, OrderItem.business_id == business_id)).all()
    return [{
        "id": item.id,
        "product_id": item.product_id,
        "product_name": product.name,
        "quantity": item.quantity,
        "unit_price_cents": item.unit_price_cents,
        "unit_variable_cost_cents": item.unit_variable_cost_cents,
    } for item, product in rows]


@router.get("/businesses/{business_id}/kds")
def kds(business_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id)
    orders = db.scalars(select(Order).where(
        Order.business_id == business_id,
        Order.status.notin_(("completed", "cancelled")),
    ).order_by(Order.created_at.asc()).limit(200)).all()
    result = []
    now = utcnow()
    for order in orders:
        rows = db.execute(select(OrderItem, Product).join(Product, Product.id == OrderItem.product_id).where(OrderItem.order_id == order.id)).all()
        age = max(0, int((now - _aware(order.created_at)).total_seconds() // 60))
        result.append({
            "id": order.id,
            "status": order.status,
            "source": order.source,
            "total_cents": order.total_cents,
            "age_minutes": age,
            "delayed": order.delayed,
            "version": order.version,
            "items": [{"product_id": item.product_id, "name": product.name, "quantity": item.quantity} for item, product in rows],
        })
    return {"orders": result, "count": len(result)}


@router.post("/businesses/{business_id}/production", status_code=201)
def create_production_batch(business_id: int, data: ProductionBatchIn, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id)
    product = db.get(Product, data.product_id)
    if not product or product.business_id != business_id:
        raise HTTPException(404, "Produto não encontrado")
    responsible = data.responsible_user_id or user.id
    responsible_membership = db.scalar(select(Membership).where(Membership.business_id == business_id, Membership.user_id == responsible))
    if not responsible_membership:
        raise HTTPException(422, "Responsável não pertence ao negócio")
    batch = ProductionBatch(
        business_id=business_id,
        product_id=data.product_id,
        planned_qty=data.planned_qty,
        scheduled_for=data.scheduled_for,
        responsible_user_id=responsible,
        notes=data.notes,
    )
    db.add(batch)
    db.flush()
    audit(db, business_id, user.id, "production.created", "production_batch", str(batch.id), data.model_dump(mode="json"))
    db.commit()
    return {"id": batch.id, "status": batch.status, "version": batch.version}


@router.get("/businesses/{business_id}/production")
def list_production_batches(business_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id)
    rows = db.execute(select(ProductionBatch, Product).join(Product, Product.id == ProductionBatch.product_id).where(ProductionBatch.business_id == business_id).order_by(ProductionBatch.created_at.desc()).limit(200)).all()
    return [{
        "id": batch.id,
        "product_id": product.id,
        "product_name": product.name,
        "responsible_user_id": batch.responsible_user_id,
        "status": batch.status,
        "planned_qty": batch.planned_qty,
        "produced_qty": batch.produced_qty,
        "waste_qty": batch.waste_qty,
        "scheduled_for": batch.scheduled_for.isoformat() if batch.scheduled_for else None,
        "notes": batch.notes,
        "version": batch.version,
    } for batch, product in rows]


@router.patch("/businesses/{business_id}/production/{batch_id}")
def update_production_batch(business_id: int, batch_id: int, data: ProductionBatchUpdateIn, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]):
    member_or_403(db, user, business_id)
    batch = db.get(ProductionBatch, batch_id)
    if not batch or batch.business_id != business_id:
        raise HTTPException(404, "Lote não encontrado")
    if batch.version != data.expected_version:
        raise HTTPException(409, "Lote foi alterado por outra sessão")
    if data.status not in {"planned", "in_progress", "completed", "cancelled"}:
        raise HTTPException(422, "Status inválido")
    batch.status = data.status
    batch.produced_qty = data.produced_qty
    batch.waste_qty = data.waste_qty
    if data.notes is not None:
        batch.notes = data.notes
    batch.version += 1
    audit(db, business_id, user.id, "production.updated", "production_batch", str(batch.id), data.model_dump())
    db.commit()
    return {"id": batch.id, "status": batch.status, "produced_qty": batch.produced_qty, "waste_qty": batch.waste_qty, "version": batch.version}


@router.get("/businesses/{business_id}/demand")
def demand_forecast(business_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)], horizon_days: int = Query(default=1, ge=1, le=14)):
    member_or_403(db, user, business_id)
    now = utcnow()
    orders = db.scalars(select(Order).where(Order.business_id == business_id, Order.paid == True, Order.status != "cancelled")).all()
    orders = [o for o in orders if _aware(o.created_at) >= now - timedelta(days=28)]
    order_map = {o.id: o for o in orders}
    product_qty_7: dict[int, int] = {}
    product_qty_prev21: dict[int, int] = {}
    active_days: dict[int, set[str]] = {}
    if order_map:
        items = db.scalars(select(OrderItem).where(OrderItem.business_id == business_id, OrderItem.order_id.in_(tuple(order_map.keys())))).all()
        for item in items:
            order = order_map[item.order_id]
            age = now - _aware(order.created_at)
            target = product_qty_7 if age <= timedelta(days=7) else product_qty_prev21
            target[item.product_id] = target.get(item.product_id, 0) + item.quantity
            active_days.setdefault(item.product_id, set()).add(_aware(order.created_at).date().isoformat())
    open_orders = db.scalars(select(Order).where(Order.business_id == business_id, Order.status.notin_(("completed", "cancelled")))).all()
    open_ids = tuple(o.id for o in open_orders)
    committed: dict[int, int] = {}
    if open_ids:
        open_items = db.scalars(select(OrderItem).where(OrderItem.business_id == business_id, OrderItem.order_id.in_(open_ids))).all()
        for item in open_items:
            committed[item.product_id] = committed.get(item.product_id, 0) + item.quantity
    products = db.scalars(select(Product).where(Product.business_id == business_id, Product.soft_deleted == False, Product.active == True).order_by(Product.name)).all()
    rows = []
    for product in products:
        q7 = product_qty_7.get(product.id, 0)
        q21 = product_qty_prev21.get(product.id, 0)
        if q7 == 0 and q21 == 0:
            daily = 0.0
        elif q21 == 0:
            daily = q7 / 7
        elif q7 == 0:
            daily = q21 / 21
        else:
            daily = 0.70 * (q7 / 7) + 0.30 * (q21 / 21)
        forecast = ceil(daily * horizon_days)
        historical_units = q7 + q21
        days_seen = len(active_days.get(product.id, set()))
        confidence = "high" if historical_units >= 20 and days_seen >= 7 else "medium" if historical_units >= 6 and days_seen >= 3 else "low"
        rows.append({
            "product_id": product.id,
            "product_name": product.name,
            "horizon_days": horizon_days,
            "historical_units_28d": historical_units,
            "recent_units_7d": q7,
            "forecast_units": forecast,
            "open_committed_units": committed.get(product.id, 0),
            "recommended_units": forecast + committed.get(product.id, 0),
            "confidence": confidence,
            "method": "weighted_moving_average_7_21",
        })
    return {"generated_at": now.isoformat(), "horizon_days": horizon_days, "products": rows}


@router.get("/businesses/{business_id}/finance/summary")
def finance_period(business_id: int, user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)], days: int = Query(default=30, ge=1, le=365)):
    member_or_403(db, user, business_id)
    return finance_summary(db, business_id, days)
