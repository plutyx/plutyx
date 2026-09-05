from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, select, text
from sqlalchemy.orm import Mapped, Session, mapped_column

from .auth import current_user
from .db import Base, get_db
from .market import audit, finance_summary, inventory_alert_rows, member_or_403
from .models import Ingredient, Loss, Order, OrderItem, Product, Purchase, User, utcnow
from .snapshots import theoretical_usage_for_orders


router = APIRouter(tags=["market-intelligence-v09"])


class InventoryCount(Base):
    __tablename__ = "inventory_counts"
    __table_args__ = (
        Index("ix_inventory_counts_business_ingredient_created", "business_id", "ingredient_id", "created_at"),
        Index("ix_inventory_counts_user", "counted_by_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id", ondelete="RESTRICT"), index=True)
    counted_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    counted_milliunits: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class InventoryCountIn(BaseModel):
    ingredient_id: int
    counted_milliunits: int = Field(ge=0, le=2_000_000_000)
    note: str = Field(default="", max_length=500)


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _menu_engineering(db: Session, business_id: int, days: int) -> dict:
    start = utcnow() - timedelta(days=days)
    orders = db.scalars(select(Order).where(
        Order.business_id == business_id,
        Order.paid == True,
        Order.status != "cancelled",
    )).all()
    orders = [o for o in orders if _aware(o.created_at) >= start]
    order_ids = tuple(o.id for o in orders)
    if not order_ids:
        return {"period_days": days, "products": [], "benchmarks": {"avg_units": 0, "avg_contribution_per_unit_cents": 0}}

    products = {p.id: p for p in db.scalars(select(Product).where(Product.business_id == business_id)).all()}
    rows = db.scalars(select(OrderItem).where(
        OrderItem.business_id == business_id,
        OrderItem.order_id.in_(order_ids),
    )).all()

    stats: dict[int, dict] = {}
    for item in rows:
        if item.product_id not in products:
            continue
        row = stats.setdefault(item.product_id, {"units": 0, "revenue_cents": 0, "contribution_cents": 0})
        row["units"] += item.quantity
        revenue = item.unit_price_cents * item.quantity
        variable = item.unit_variable_cost_cents * item.quantity
        row["revenue_cents"] += revenue
        row["contribution_cents"] += revenue - variable

    if not stats:
        return {"period_days": days, "products": [], "benchmarks": {"avg_units": 0, "avg_contribution_per_unit_cents": 0}}

    avg_units = sum(x["units"] for x in stats.values()) / len(stats)
    per_unit_values = [x["contribution_cents"] / x["units"] for x in stats.values() if x["units"]]
    avg_cpu = sum(per_unit_values) / len(per_unit_values) if per_unit_values else 0

    result = []
    for product_id, data in stats.items():
        units = data["units"]
        cpu = round(data["contribution_cents"] / units) if units else 0
        high_volume = units >= avg_units
        high_margin = cpu >= avg_cpu
        if high_volume and high_margin:
            classification, action = "champion", "proteger disponibilidade e testar aumento moderado de preço"
        elif high_volume and not high_margin:
            classification, action = "traffic_driver", "revisar ficha técnica, embalagem e preço antes de promover mais"
        elif not high_volume and high_margin:
            classification, action = "opportunity", "melhorar destaque, foto, combo e exposição"
        else:
            classification, action = "review", "simplificar, reposicionar ou retirar se continuar sem tração"
        product = products[product_id]
        result.append({
            "product_id": product_id,
            "product_name": product.name,
            "category": product.category,
            "units": units,
            "revenue_cents": data["revenue_cents"],
            "contribution_cents": data["contribution_cents"],
            "contribution_per_unit_cents": cpu,
            "classification": classification,
            "suggested_action": action,
        })
    result.sort(key=lambda x: (x["contribution_cents"], x["units"]), reverse=True)
    return {
        "period_days": days,
        "products": result,
        "benchmarks": {
            "avg_units": round(avg_units, 2),
            "avg_contribution_per_unit_cents": round(avg_cpu),
        },
        "method": "relative_popularity_x_item_contribution",
    }


def _price_movers(db: Session, business_id: int, days: int) -> list[dict]:
    start = utcnow() - timedelta(days=days)
    purchases = db.scalars(select(Purchase).where(Purchase.business_id == business_id).order_by(Purchase.created_at.asc())).all()
    purchases = [p for p in purchases if _aware(p.created_at) >= start]
    ingredients = {i.id: i for i in db.scalars(select(Ingredient).where(Ingredient.business_id == business_id)).all()}
    grouped: dict[int, list[Purchase]] = defaultdict(list)
    for purchase in purchases:
        grouped[purchase.ingredient_id].append(purchase)

    rows = []
    for ingredient_id, items in grouped.items():
        if ingredient_id not in ingredients or not items:
            continue
        first, last = items[0], items[-1]
        first_landed = first.total_cents + first.freight_cents + first.tax_cents
        last_landed = last.total_cents + last.freight_cents + last.tax_cents
        first_per_1000 = round(first_landed * 1000 / max(1, first.quantity_milliunits))
        last_per_1000 = round(last_landed * 1000 / max(1, last.quantity_milliunits))
        change_bps = round((last_per_1000 - first_per_1000) * 10000 / first_per_1000) if first_per_1000 else 0
        rows.append({
            "ingredient_id": ingredient_id,
            "name": ingredients[ingredient_id].name,
            "purchase_count": len(items),
            "first_cost_per_1000_milliunits_cents": first_per_1000,
            "last_cost_per_1000_milliunits_cents": last_per_1000,
            "change_bps": change_bps,
            "direction": "up" if change_bps > 0 else "down" if change_bps < 0 else "flat",
        })
    rows.sort(key=lambda x: abs(x["change_bps"]), reverse=True)
    return rows


def _daily_control(db: Session, business_id: int, days: int) -> list[dict]:
    start = utcnow() - timedelta(days=days)
    bucket: dict[str, dict] = defaultdict(lambda: {
        "revenue_cents": 0,
        "variable_costs_cents": 0,
        "contribution_cents": 0,
        "loss_cents": 0,
        "purchase_cash_out_cents": 0,
        "orders": 0,
    })
    for order in db.scalars(select(Order).where(Order.business_id == business_id, Order.paid == True)).all():
        if _aware(order.created_at) < start:
            continue
        day = _aware(order.created_at).date().isoformat()
        bucket[day]["revenue_cents"] += order.total_cents
        bucket[day]["variable_costs_cents"] += order.variable_cost_cents
        bucket[day]["contribution_cents"] += order.contribution_cents
        bucket[day]["orders"] += 1
    for loss in db.scalars(select(Loss).where(Loss.business_id == business_id)).all():
        if _aware(loss.created_at) >= start:
            bucket[_aware(loss.created_at).date().isoformat()]["loss_cents"] += loss.estimated_cost_cents
    for purchase in db.scalars(select(Purchase).where(Purchase.business_id == business_id)).all():
        if _aware(purchase.created_at) >= start:
            bucket[_aware(purchase.created_at).date().isoformat()]["purchase_cash_out_cents"] += purchase.total_cents + purchase.freight_cents + purchase.tax_cents
    return [{"date": day, **bucket[day]} for day in sorted(bucket)]


@router.get("/ready")
def ready(db: Annotated[Session, Depends(get_db)]):
    db.execute(text("select 1"))
    return {"ok": True, "database": "reachable", "service": "cozinha360-api"}


@router.post("/businesses/{business_id}/inventory/counts", status_code=201)
def create_inventory_count(
    business_id: int,
    data: InventoryCountIn,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    member_or_403(db, user, business_id)
    ingredient = db.get(Ingredient, data.ingredient_id)
    if not ingredient or ingredient.business_id != business_id or ingredient.soft_deleted:
        raise HTTPException(404, "Ingrediente não encontrado")
    previous = ingredient.on_hand_milliunits
    count = InventoryCount(
        business_id=business_id,
        ingredient_id=ingredient.id,
        counted_by_user_id=user.id,
        counted_milliunits=data.counted_milliunits,
        note=data.note.strip(),
    )
    db.add(count)
    ingredient.on_hand_milliunits = data.counted_milliunits
    ingredient.version += 1
    db.flush()
    audit(db, business_id, user.id, "inventory.counted", "inventory_count", str(count.id), {
        "ingredient_id": ingredient.id,
        "system_before_milliunits": previous,
        "physical_count_milliunits": data.counted_milliunits,
        "adjustment_milliunits": data.counted_milliunits - previous,
    })
    db.commit()
    return {
        "id": count.id,
        "ingredient_id": ingredient.id,
        "system_before_milliunits": previous,
        "counted_milliunits": count.counted_milliunits,
        "adjustment_milliunits": count.counted_milliunits - previous,
        "ingredient_version": ingredient.version,
    }


@router.get("/businesses/{business_id}/inventory/counts")
def list_inventory_counts(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=100, ge=1, le=500),
):
    member_or_403(db, user, business_id)
    ingredients = {i.id: i.name for i in db.scalars(select(Ingredient).where(Ingredient.business_id == business_id)).all()}
    rows = db.scalars(select(InventoryCount).where(InventoryCount.business_id == business_id).order_by(InventoryCount.created_at.desc()).limit(limit)).all()
    return [{
        "id": row.id,
        "ingredient_id": row.ingredient_id,
        "ingredient_name": ingredients.get(row.ingredient_id, ""),
        "counted_milliunits": row.counted_milliunits,
        "counted_by_user_id": row.counted_by_user_id,
        "note": row.note,
        "created_at": row.created_at.isoformat(),
    } for row in rows]


@router.get("/businesses/{business_id}/inventory/variance")
def inventory_variance(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    member_or_403(db, user, business_id)
    ingredients = db.scalars(select(Ingredient).where(Ingredient.business_id == business_id, Ingredient.soft_deleted == False)).all()
    result = []
    for ingredient in ingredients:
        counts = db.scalars(select(InventoryCount).where(
            InventoryCount.business_id == business_id,
            InventoryCount.ingredient_id == ingredient.id,
        ).order_by(InventoryCount.created_at.desc()).limit(2)).all()
        if len(counts) < 2:
            continue
        closing, opening = counts[0], counts[1]
        start, end = _aware(opening.created_at), _aware(closing.created_at)
        purchases = db.scalars(select(Purchase).where(Purchase.business_id == business_id, Purchase.ingredient_id == ingredient.id)).all()
        purchased_qty = sum(p.quantity_milliunits for p in purchases if start < _aware(p.created_at) <= end)
        losses = db.scalars(select(Loss).where(Loss.business_id == business_id, Loss.ingredient_id == ingredient.id)).all()
        recorded_loss = sum(x.qty_milliunits for x in losses if start < _aware(x.created_at) <= end)

        orders = db.scalars(select(Order).where(
            Order.business_id == business_id,
            Order.status == "completed",
        )).all()
        period_orders = [o for o in orders if start < _aware(o.created_at) <= end]
        usage = theoretical_usage_for_orders(
            db,
            business_id,
            tuple(o.id for o in period_orders),
            ingredient.id,
        )
        theoretical = usage["qty_milliunits"]

        expected_closing = opening.counted_milliunits + purchased_qty - theoretical - recorded_loss
        variance = closing.counted_milliunits - expected_closing
        estimated_value_cents = round(abs(variance) * ingredient.last_purchase_price_cents / max(1, ingredient.usable_qty_milliunits))
        if usage["legacy_orders"]:
            method_note = (
                "Pedidos concluídos após v0.9 usam snapshots imutáveis da ficha técnica. "
                f"{usage['legacy_orders']} pedido(s) legado(s) ainda usam a receita atual como fallback."
            )
        else:
            method_note = "Uso teórico reconstruído pelos snapshots imutáveis da ficha técnica capturados na conclusão de cada pedido."
        result.append({
            "ingredient_id": ingredient.id,
            "name": ingredient.name,
            "from": opening.created_at.isoformat(),
            "to": closing.created_at.isoformat(),
            "opening_milliunits": opening.counted_milliunits,
            "purchased_milliunits": purchased_qty,
            "theoretical_usage_milliunits": theoretical,
            "recorded_loss_milliunits": recorded_loss,
            "expected_closing_milliunits": expected_closing,
            "physical_closing_milliunits": closing.counted_milliunits,
            "variance_milliunits": variance,
            "variance_estimated_value_cents": estimated_value_cents,
            "signal": "shrink" if variance < 0 else "surplus" if variance > 0 else "balanced",
            "confidence": usage["confidence"],
            "snapshot_orders": usage["snapshot_orders"],
            "legacy_orders": usage["legacy_orders"],
            "method": usage["method"],
            "method_note": method_note,
        })
    result.sort(key=lambda x: x["variance_estimated_value_cents"], reverse=True)
    return {"ingredients": result, "count": len(result)}


@router.get("/businesses/{business_id}/insights/menu-engineering")
def menu_engineering(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    days: int = Query(default=30, ge=7, le=365),
):
    member_or_403(db, user, business_id)
    return _menu_engineering(db, business_id, days)


@router.get("/businesses/{business_id}/insights/price-movers")
def price_movers(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    days: int = Query(default=30, ge=1, le=365),
):
    member_or_403(db, user, business_id)
    return {"period_days": days, "ingredients": _price_movers(db, business_id, days)}


@router.get("/businesses/{business_id}/insights/daily-control")
def daily_control(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    days: int = Query(default=30, ge=1, le=365),
):
    member_or_403(db, user, business_id)
    return {
        "period_days": days,
        "days": _daily_control(db, business_id, days),
        "summary": finance_summary(db, business_id, days),
        "accounting_note": "This is a controllable operating view, not statutory accounting P&L. Purchases are shown as cash-out, not automatically treated as COGS.",
    }


@router.get("/businesses/{business_id}/insights/owner-brief")
def owner_brief(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    membership = member_or_403(db, user, business_id)
    finance = finance_summary(db, business_id, 30)
    alerts = inventory_alert_rows(db, business_id)
    movers = _price_movers(db, business_id, 30)
    menu = _menu_engineering(db, business_id, 30)
    orders = db.scalars(select(Order).where(Order.business_id == business_id, Order.status.notin_(("completed", "cancelled")))).all()
    delayed = sum(1 for o in orders if o.delayed)

    actions = []
    if alerts:
        actions.append({"priority": 1, "area": "inventory", "title": f"Repor {len(alerts)} ingrediente(s) abaixo do par", "severity": "critical" if any(x["severity"] == "critical" for x in alerts) else "warning"})
    up = [x for x in movers if x["change_bps"] >= 500]
    if up:
        actions.append({"priority": 2, "area": "cost", "title": f"Revisar {len(up)} custo(s) que subiram 5% ou mais", "severity": "warning"})
    weak = [x for x in menu["products"] if x["classification"] == "review"]
    if weak:
        actions.append({"priority": 3, "area": "menu", "title": f"Reavaliar {len(weak)} item(ns) com baixa tração e contribuição", "severity": "info"})
    if delayed:
        actions.append({"priority": 1, "area": "kds", "title": f"Resolver {delayed} pedido(s) marcados como atrasados", "severity": "critical"})
    if finance["revenue_cents"] and finance["contribution_margin_bps"] < 1500:
        actions.append({"priority": 1, "area": "finance", "title": "Margem de contribuição dos últimos 30 dias abaixo de 15%", "severity": "critical"})
    if not actions:
        actions.append({"priority": 5, "area": "steady", "title": "Sem exceções críticas detectadas; mantenha contagens e registros em dia", "severity": "good"})
    actions.sort(key=lambda x: x["priority"])
    return {
        "member_role": membership.role,
        "generated_at": utcnow().isoformat(),
        "actions": actions[:5],
        "signals": {
            "inventory_alerts": len(alerts),
            "price_increases_ge_5pct": len(up),
            "menu_items_to_review": len(weak),
            "delayed_open_orders": delayed,
            "contribution_margin_bps_30d": finance["contribution_margin_bps"],
        },
        "principle": "Show the next operational decision before adding more dashboards.",
    }
