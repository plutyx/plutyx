from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user
from .db import get_db
from .insights import InventoryCount
from .market import member_or_403
from .models import Ingredient, Loss, Order, Purchase, User, utcnow
from .snapshots import theoretical_usage_for_orders

router = APIRouter(tags=["smart-cmv-v50"])


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _in_window(value: datetime | None, start: datetime, end: datetime) -> bool:
    current = _aware(value)
    return current is not None and start < current <= end


def _cost_per_1000(ingredient: Ingredient, purchases: list[Purchase]) -> tuple[int, str]:
    qty = sum(max(0, row.quantity_milliunits) for row in purchases)
    landed = sum(max(0, row.total_cents + row.freight_cents + row.tax_cents) for row in purchases)
    if qty > 0 and landed > 0:
        return round(landed * 1000 / qty), "weighted_purchases_in_period"
    if ingredient.usable_qty_milliunits > 0 and ingredient.last_purchase_price_cents > 0:
        return round(ingredient.last_purchase_price_cents * 1000 / ingredient.usable_qty_milliunits), "last_purchase_cost"
    return 0, "missing_cost"


def _money_for_qty(qty_milliunits: int, cents_per_1000: int) -> int:
    return round(qty_milliunits * cents_per_1000 / 1000)


@router.get("/businesses/{business_id}/smart-cmv")
def smart_cmv(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    member_or_403(db, user, business_id)
    ingredients = db.scalars(
        select(Ingredient)
        .where(Ingredient.business_id == business_id, Ingredient.soft_deleted == False)
        .order_by(Ingredient.name)
    ).all()
    purchases = db.scalars(select(Purchase).where(Purchase.business_id == business_id)).all()
    losses = db.scalars(select(Loss).where(Loss.business_id == business_id)).all()
    completed_orders = db.scalars(
        select(Order).where(Order.business_id == business_id, Order.status == "completed")
    ).all()

    rows: list[dict] = []
    ready_rows: list[dict] = []
    for ingredient in ingredients:
        counts = db.scalars(
            select(InventoryCount)
            .where(
                InventoryCount.business_id == business_id,
                InventoryCount.ingredient_id == ingredient.id,
            )
            .order_by(InventoryCount.created_at.desc(), InventoryCount.id.desc())
            .limit(2)
        ).all()
        if len(counts) < 2:
            last_count = counts[0] if counts else None
            rows.append({
                "ingredient_id": ingredient.id,
                "name": ingredient.name,
                "unit": ingredient.unit,
                "status": "needs_count" if last_count else "needs_two_counts",
                "count_count": len(counts),
                "last_count_at": last_count.created_at.isoformat() if last_count else None,
                "current_on_hand_milliunits": ingredient.on_hand_milliunits,
                "message": "Faça mais uma contagem física para comparar consumo observado e teórico." if last_count else "Faça duas contagens físicas em dias diferentes para liberar a comparação observada.",
            })
            continue

        closing, opening = counts[0], counts[1]
        start = _aware(opening.created_at)
        end = _aware(closing.created_at)
        assert start is not None and end is not None
        period_purchases = [
            row for row in purchases
            if row.ingredient_id == ingredient.id and _in_window(row.created_at, start, end)
        ]
        purchased_qty = sum(max(0, row.quantity_milliunits) for row in period_purchases)
        purchased_landed_cents = sum(max(0, row.total_cents + row.freight_cents + row.tax_cents) for row in period_purchases)
        recorded_loss_qty = sum(
            max(0, row.qty_milliunits)
            for row in losses
            if row.ingredient_id == ingredient.id and _in_window(row.created_at, start, end)
        )
        period_orders = []
        legacy_timing_orders = 0
        for order in completed_orders:
            consumption_at = order.completed_at or order.created_at
            if _in_window(consumption_at, start, end):
                period_orders.append(order)
                if order.completed_at is None:
                    legacy_timing_orders += 1
        usage = theoretical_usage_for_orders(
            db,
            business_id,
            tuple(order.id for order in period_orders),
            ingredient.id,
        )
        theoretical_qty = int(usage["qty_milliunits"] or 0)
        observed_qty = (
            opening.counted_milliunits
            + purchased_qty
            - closing.counted_milliunits
            - recorded_loss_qty
        )
        unexplained_qty = observed_qty - theoretical_qty
        cost_per_1000, cost_basis = _cost_per_1000(ingredient, period_purchases)
        observed_cmv_cents = _money_for_qty(max(0, observed_qty), cost_per_1000)
        theoretical_cmv_cents = _money_for_qty(max(0, theoretical_qty), cost_per_1000)
        unexplained_cents = _money_for_qty(unexplained_qty, cost_per_1000)
        ratio = abs(unexplained_qty) / max(1, theoretical_qty) if theoretical_qty else (1.0 if unexplained_qty else 0.0)

        if observed_qty < 0:
            signal, severity = "data_error", "critical"
            action = "Revise contagens e compras: o período resultou em consumo observado negativo."
        elif unexplained_qty > 0 and ratio >= 0.10:
            signal, severity = "shrink", "critical" if ratio >= 0.25 else "warning"
            action = "Investigue porcionamento, perdas não registradas, brindes, erros de ficha ou contagem."
        elif unexplained_qty < 0 and ratio >= 0.10:
            signal, severity = "surplus", "warning"
            action = "Revise ficha técnica, rendimento, unidade de medida ou registros de compra/contagem."
        else:
            signal, severity = "balanced", "stable"
            action = "Variação dentro do limite de 10%; continue contando no mesmo ritmo."

        confidence = str(usage.get("confidence") or "low")
        if cost_per_1000 <= 0:
            confidence = "low"
        elif legacy_timing_orders or usage.get("legacy_orders"):
            confidence = "medium" if confidence == "high" else confidence
        interval_days = max(0.0, (end - start).total_seconds() / 86400)
        if interval_days < 0.5:
            confidence = "low"

        row = {
            "ingredient_id": ingredient.id,
            "name": ingredient.name,
            "unit": ingredient.unit,
            "status": "ready",
            "from": opening.created_at.isoformat(),
            "to": closing.created_at.isoformat(),
            "interval_days": round(interval_days, 2),
            "opening_milliunits": opening.counted_milliunits,
            "purchased_milliunits": purchased_qty,
            "purchased_landed_cents": purchased_landed_cents,
            "recorded_loss_milliunits": recorded_loss_qty,
            "physical_closing_milliunits": closing.counted_milliunits,
            "observed_usage_milliunits": observed_qty,
            "theoretical_usage_milliunits": theoretical_qty,
            "unexplained_usage_milliunits": unexplained_qty,
            "cost_per_1000_milliunits_cents": cost_per_1000,
            "cost_basis": cost_basis,
            "observed_cmv_cents": observed_cmv_cents,
            "theoretical_cmv_cents": theoretical_cmv_cents,
            "unexplained_value_cents": unexplained_cents,
            "variance_ratio": round(ratio, 4),
            "signal": signal,
            "severity": severity,
            "suggested_action": action,
            "confidence": confidence,
            "snapshot_orders": int(usage.get("snapshot_orders") or 0),
            "legacy_orders": int(usage.get("legacy_orders") or 0),
            "legacy_timing_orders": legacy_timing_orders,
        }
        rows.append(row)
        ready_rows.append(row)

    ready_rows.sort(key=lambda item: abs(item["unexplained_value_cents"]), reverse=True)
    rows.sort(
        key=lambda item: (
            0 if item.get("status") == "ready" else 1,
            -abs(item.get("unexplained_value_cents", 0)),
            item["name"].casefold(),
        )
    )
    total = len(ingredients)
    ready = len(ready_rows)
    coverage = round(ready / total, 4) if total else 0.0
    observed_total = sum(item["observed_cmv_cents"] for item in ready_rows)
    theoretical_total = sum(item["theoretical_cmv_cents"] for item in ready_rows)
    unexplained_total = sum(item["unexplained_value_cents"] for item in ready_rows)
    critical = sum(1 for item in ready_rows if item["severity"] == "critical")
    warning = sum(1 for item in ready_rows if item["severity"] == "warning")
    top = ready_rows[0] if ready_rows else None

    if top and top["severity"] in ("critical", "warning"):
        headline = {
            "tone": top["severity"],
            "title": f"{top['name']}: {abs(top['unexplained_usage_milliunits'])} {top['unit']} de diferença sem explicação",
            "detail": top["suggested_action"],
            "ingredient_id": top["ingredient_id"],
        }
    elif ready:
        headline = {
            "tone": "stable",
            "title": "Contagens comparáveis sem desvio relevante no topo da lista",
            "detail": "Continue registrando compras, perdas e contagens para aumentar a confiança.",
            "ingredient_id": top["ingredient_id"] if top else None,
        }
    else:
        headline = {
            "tone": "neutral",
            "title": "O CMV observado começa com duas contagens físicas",
            "detail": "Conte os ingredientes hoje e repita em outro dia. O 360 cruza compras, perdas e consumo teórico sem inventar dados.",
            "ingredient_id": None,
        }

    return {
        "generated_at": utcnow().isoformat(),
        "method": "physical_counts_plus_purchases_minus_closing_minus_recorded_losses",
        "summary": {
            "ingredients_total": total,
            "ingredients_ready": ready,
            "coverage": coverage,
            "critical": critical,
            "warning": warning,
            "observed_cmv_cents": observed_total,
            "theoretical_cmv_cents": theoretical_total,
            "unexplained_value_cents": unexplained_total,
        },
        "headline": headline,
        "ingredients": rows,
        "accounting_note": "CMV observado é uma visão operacional estimada apenas para ingredientes com duas contagens comparáveis. Não substitui DRE contábil ou inventário fiscal.",
        "safety_note": "O endpoint é somente leitura: não altera estoque, ficha técnica, compras ou pedidos.",
    }
