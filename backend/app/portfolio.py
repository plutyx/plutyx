from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user
from .db import get_db
from .models import Business, Ingredient, Membership, Order, User, utcnow

router = APIRouter(tags=["portfolio-v50"])


def _pct(value: float) -> float:
    return round(max(0.0, float(value or 0)), 4)


def _signal(score: int, code: str, tone: str, title: str, detail: str) -> dict:
    return {"score": score, "code": code, "tone": tone, "title": title, "detail": detail}


@router.get("/portfolio/overview")
def portfolio_overview(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    memberships = db.execute(
        select(Membership, Business)
        .join(Business, Business.id == Membership.business_id)
        .where(Membership.user_id == user.id, Business.soft_deleted == False)
        .order_by(Business.name)
    ).all()
    if not memberships:
        return {
            "generated_at": utcnow().isoformat(),
            "period_days": 30,
            "summary": {
                "businesses": 0,
                "attention": 0,
                "critical": 0,
                "revenue_cents": 0,
                "contribution_cents": 0,
                "order_count": 0,
                "open_orders": 0,
                "delayed_open": 0,
                "stock_alerts": 0,
            },
            "top_action": None,
            "businesses": [],
        }

    business_ids = [business.id for _, business in memberships]
    cutoff = utcnow() - timedelta(days=30)
    orders = db.scalars(select(Order).where(Order.business_id.in_(business_ids))).all()
    ingredients = db.scalars(
        select(Ingredient).where(
            Ingredient.business_id.in_(business_ids),
            Ingredient.soft_deleted == False,
        )
    ).all()

    orders_by_business: dict[int, list[Order]] = {bid: [] for bid in business_ids}
    for order in orders:
        orders_by_business.setdefault(order.business_id, []).append(order)
    ingredients_by_business: dict[int, list[Ingredient]] = {bid: [] for bid in business_ids}
    for ingredient in ingredients:
        ingredients_by_business.setdefault(ingredient.business_id, []).append(ingredient)

    rows: list[dict] = []
    for membership, business in memberships:
        all_orders = orders_by_business.get(business.id, [])
        paid = [
            order
            for order in all_orders
            if order.paid and order.created_at and order.created_at >= cutoff
        ]
        open_orders = [
            order for order in all_orders if order.status not in ("completed", "cancelled")
        ]
        delayed_open = [order for order in open_orders if order.delayed]
        revenue = sum(order.total_cents for order in paid)
        contribution = sum(order.contribution_cents for order in paid)
        order_count = len(paid)
        margin_bps = round(contribution * 10000 / revenue) if revenue > 0 else 0
        delay_rate = _pct(sum(1 for order in paid if order.delayed) / order_count) if order_count else 0.0
        error_rate = _pct(sum(1 for order in paid if order.error_flag) / order_count) if order_count else 0.0
        stock_alerts = [
            item
            for item in ingredients_by_business.get(business.id, [])
            if item.par_level_milliunits > 0 and item.on_hand_milliunits < item.par_level_milliunits
        ]

        signals: list[dict] = []
        if contribution < 0 and order_count:
            signals.append(_signal(100, "negative_contribution", "critical", "Contribuição negativa", "Não acelere aquisição antes de corrigir preço, custo ou mix."))
        if delayed_open:
            oldest = max((int((utcnow() - order.created_at).total_seconds() // 60) if order.created_at else 0) for order in delayed_open)
            signals.append(_signal(96, "delayed_open", "critical", f"{len(delayed_open)} pedido(s) atrasado(s)", f"O mais antigo está aberto há aproximadamente {oldest} min."))
        if stock_alerts:
            signals.append(_signal(90, "stock", "critical", f"{len(stock_alerts)} item(ns) abaixo do mínimo", "Há risco de ruptura ou substituição na produção."))
        if delay_rate > 0.15:
            signals.append(_signal(82, "delay_rate", "warning", "Atraso recorrente", f"Taxa de atraso em 30 dias: {round(delay_rate * 100)}%."))
        if error_rate > 0.05:
            signals.append(_signal(78, "error_rate", "warning", "Erros acima do limite", f"Taxa de erro em 30 dias: {round(error_rate * 100)}%."))
        if not order_count:
            signals.append(_signal(28, "no_data", "neutral", "Sem pedidos pagos recentes", "Ainda não há base de 30 dias para comparar margem e qualidade."))
        if not signals:
            signals.append(_signal(10, "stable", "stable", "Sem bloqueio crítico detectado", "Margem, atraso, erro e estoque não dispararam os limites desta visão."))

        signals.sort(key=lambda item: item["score"], reverse=True)
        attention = signals[0]
        rows.append(
            {
                "business_id": business.id,
                "name": business.name,
                "city": business.city,
                "role": membership.role,
                "revenue_cents": revenue,
                "contribution_cents": contribution,
                "contribution_margin_bps": margin_bps,
                "order_count": order_count,
                "open_orders": len(open_orders),
                "delayed_open": len(delayed_open),
                "delay_rate": delay_rate,
                "error_rate": error_rate,
                "stock_alerts": len(stock_alerts),
                "attention": attention,
                "signals": signals,
            }
        )

    rows.sort(key=lambda item: (-item["attention"]["score"], item["name"].casefold()))
    critical = sum(1 for item in rows if item["attention"]["tone"] == "critical")
    attention_count = sum(1 for item in rows if item["attention"]["score"] >= 70)
    summary = {
        "businesses": len(rows),
        "attention": attention_count,
        "critical": critical,
        "revenue_cents": sum(item["revenue_cents"] for item in rows),
        "contribution_cents": sum(item["contribution_cents"] for item in rows),
        "order_count": sum(item["order_count"] for item in rows),
        "open_orders": sum(item["open_orders"] for item in rows),
        "delayed_open": sum(item["delayed_open"] for item in rows),
        "stock_alerts": sum(item["stock_alerts"] for item in rows),
    }
    top = rows[0] if rows else None
    top_action = None if not top else {
        "business_id": top["business_id"],
        "business_name": top["name"],
        "score": top["attention"]["score"],
        "tone": top["attention"]["tone"],
        "title": top["attention"]["title"],
        "detail": top["attention"]["detail"],
        "href": f"/?today=1&business_id={top['business_id']}",
    }
    return {
        "generated_at": utcnow().isoformat(),
        "period_days": 30,
        "summary": summary,
        "top_action": top_action,
        "businesses": rows,
    }
