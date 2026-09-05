from __future__ import annotations

import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import current_user
from .db import get_db
from .market import audit, member_or_403
from .models import (
    Business,
    Channel,
    Customer,
    Ingredient,
    Order,
    OrderItem,
    OutboxEvent,
    Product,
    RecipeItem,
    User,
)

router = APIRouter(tags=["simplicity-v11"])


class QuickOrderIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=10000)
    unit_price_cents: int = Field(gt=0)
    customer_id: int | None = None
    channel_id: int | None = None
    source: str = Field(default="manual", min_length=1, max_length=80)
    paid: bool = True
    idempotency_key: str | None = Field(default=None, max_length=160)


def _recipe_cost_breakdown(db: Session, business_id: int, product: Product) -> dict:
    rows = db.execute(
        select(RecipeItem, Ingredient)
        .join(Ingredient, Ingredient.id == RecipeItem.ingredient_id)
        .where(
            RecipeItem.product_id == product.id,
            Ingredient.business_id == business_id,
            Ingredient.soft_deleted == False,
        )
    ).all()
    if not rows:
        raise HTTPException(422, "Cadastre a ficha técnica antes de vender este produto")

    missing_price: list[str] = []
    ingredients: list[dict] = []
    ingredient_cost = 0
    for item, ingredient in rows:
        if ingredient.last_purchase_price_cents <= 0:
            missing_price.append(ingredient.name)
            continue
        estimated = round(
            ingredient.last_purchase_price_cents
            * item.qty_used_milliunits
            / max(1, ingredient.usable_qty_milliunits)
        )
        ingredient_cost += estimated
        ingredients.append(
            {
                "ingredient_id": ingredient.id,
                "name": ingredient.name,
                "qty_used_milliunits": item.qty_used_milliunits,
                "estimated_cost_cents": estimated,
            }
        )

    if missing_price:
        names = ", ".join(sorted(missing_price))
        raise HTTPException(422, f"Registre o custo de compra antes de vender: {names}")

    units = max(1, product.units_per_batch)
    energy_per_unit = round(product.energy_cents_per_batch / units)
    labor_per_unit = round(product.labor_cents_per_batch / units)
    packaging_per_unit = product.packaging_cents_per_unit
    direct_cost_per_unit = ingredient_cost + packaging_per_unit + energy_per_unit + labor_per_unit

    return {
        "product_id": product.id,
        "product_name": product.name,
        "ingredients_cents": ingredient_cost,
        "packaging_cents": packaging_per_unit,
        "energy_cents": energy_per_unit,
        "labor_cents": labor_per_unit,
        "direct_cost_per_unit_cents": direct_cost_per_unit,
        "recipe_items": ingredients,
        "method": "current_recipe_plus_product_overheads",
    }


def _channel_cost(db: Session, business_id: int, channel_id: int | None, revenue_cents: int) -> tuple[Channel | None, dict]:
    if channel_id is None:
        return None, {
            "percentage_fee_cents": 0,
            "fixed_fee_cents": 0,
            "delivery_cents": 0,
            "promo_cents": 0,
            "media_cents": 0,
            "total_channel_cost_cents": 0,
        }
    channel = db.get(Channel, channel_id)
    if not channel or channel.business_id != business_id:
        raise HTTPException(404, "Canal não encontrado")
    percentage_fee = round(revenue_cents * channel.fee_bps / 10000)
    total = percentage_fee + channel.fixed_fee_cents + channel.delivery_cents + channel.promo_cents + channel.media_cents
    return channel, {
        "percentage_fee_cents": percentage_fee,
        "fixed_fee_cents": channel.fixed_fee_cents,
        "delivery_cents": channel.delivery_cents,
        "promo_cents": channel.promo_cents,
        "media_cents": channel.media_cents,
        "total_channel_cost_cents": total,
    }


@router.get("/businesses/{business_id}/onboarding")
def onboarding_status(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    member_or_403(db, user, business_id)

    ingredient_count = db.scalar(
        select(func.count(Ingredient.id)).where(
            Ingredient.business_id == business_id,
            Ingredient.soft_deleted == False,
        )
    ) or 0
    priced_ingredient_count = db.scalar(
        select(func.count(Ingredient.id)).where(
            Ingredient.business_id == business_id,
            Ingredient.soft_deleted == False,
            Ingredient.last_purchase_price_cents > 0,
        )
    ) or 0
    configured_inventory_count = db.scalar(
        select(func.count(Ingredient.id)).where(
            Ingredient.business_id == business_id,
            Ingredient.soft_deleted == False,
            Ingredient.par_level_milliunits > 0,
        )
    ) or 0
    product_count = db.scalar(
        select(func.count(Product.id)).where(
            Product.business_id == business_id,
            Product.soft_deleted == False,
            Product.active == True,
        )
    ) or 0
    recipe_product_count = db.scalar(
        select(func.count(func.distinct(RecipeItem.product_id)))
        .join(Product, Product.id == RecipeItem.product_id)
        .where(
            Product.business_id == business_id,
            Product.soft_deleted == False,
            Product.active == True,
        )
    ) or 0
    order_count = db.scalar(select(func.count(Order.id)).where(Order.business_id == business_id)) or 0

    steps = [
        {
            "code": "ingredient",
            "title": "Cadastre um ingrediente com custo real",
            "done": priced_ingredient_count > 0,
            "module": "custos",
        },
        {
            "code": "inventory",
            "title": "Defina o mínimo de estoque",
            "done": configured_inventory_count > 0,
            "module": "custos",
        },
        {
            "code": "product",
            "title": "Cadastre seu produto principal",
            "done": product_count > 0,
            "module": "produtos",
        },
        {
            "code": "recipe",
            "title": "Monte a ficha técnica",
            "done": recipe_product_count > 0,
            "module": "produtos",
        },
        {
            "code": "first_order",
            "title": "Registre o primeiro pedido",
            "done": order_count > 0,
            "module": "pedidos",
        },
    ]
    completed = sum(1 for step in steps if step["done"])
    next_step = next((step for step in steps if not step["done"]), None)
    return {
        "setup_complete": completed == len(steps),
        "progress_percent": round(completed * 100 / len(steps)),
        "next_step": next_step,
        "steps": steps,
        "counts": {
            "ingredients": ingredient_count,
            "priced_ingredients": priced_ingredient_count,
            "inventory_configured": configured_inventory_count,
            "products": product_count,
            "products_with_recipe": recipe_product_count,
            "orders": order_count,
        },
    }


@router.get("/businesses/{business_id}/products/{product_id}/cost-preview")
def product_cost_preview(
    business_id: int,
    product_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    member_or_403(db, user, business_id)
    product = db.get(Product, product_id)
    if not product or product.business_id != business_id or product.soft_deleted:
        raise HTTPException(404, "Produto não encontrado")
    return _recipe_cost_breakdown(db, business_id, product)


@router.post("/businesses/{business_id}/orders/quick", status_code=201)
def create_quick_order(
    business_id: int,
    data: QuickOrderIn,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    member_or_403(db, user, business_id)
    key = data.idempotency_key or str(uuid.uuid4())
    existing = db.scalar(
        select(Order).where(
            Order.business_id == business_id,
            Order.idempotency_key == key,
        )
    )
    if existing:
        return {
            "id": existing.id,
            "status": existing.status,
            "contribution_cents": existing.contribution_cents,
            "idempotency_key": key,
            "idempotent_replay": True,
        }

    product = db.get(Product, data.product_id)
    if not product or product.business_id != business_id or product.soft_deleted or not product.active:
        raise HTTPException(404, "Produto não encontrado ou inativo")
    if data.customer_id:
        customer = db.get(Customer, data.customer_id)
        if not customer or customer.business_id != business_id:
            raise HTTPException(404, "Cliente não encontrado")

    cost = _recipe_cost_breakdown(db, business_id, product)
    total_cents = data.unit_price_cents * data.quantity
    direct_cost_cents = cost["direct_cost_per_unit_cents"] * data.quantity
    channel, channel_cost = _channel_cost(db, business_id, data.channel_id, total_cents)
    variable_cost_cents = direct_cost_cents + channel_cost["total_channel_cost_cents"]
    contribution_cents = total_cents - variable_cost_cents

    order = Order(
        business_id=business_id,
        customer_id=data.customer_id,
        channel_id=data.channel_id,
        total_cents=total_cents,
        variable_cost_cents=variable_cost_cents,
        contribution_cents=contribution_cents,
        source=data.source,
        paid=data.paid,
        idempotency_key=key,
    )
    db.add(order)
    db.flush()
    db.add(
        OrderItem(
            business_id=business_id,
            order_id=order.id,
            product_id=product.id,
            quantity=data.quantity,
            unit_price_cents=data.unit_price_cents,
            unit_variable_cost_cents=cost["direct_cost_per_unit_cents"],
        )
    )
    audit(
        db,
        business_id,
        user.id,
        "order.quick_created",
        "order",
        str(order.id),
        {
            "product_id": product.id,
            "quantity": data.quantity,
            "unit_price_cents": data.unit_price_cents,
            "direct_cost_per_unit_cents": cost["direct_cost_per_unit_cents"],
            "channel_id": channel.id if channel else None,
            "channel_cost_cents": channel_cost["total_channel_cost_cents"],
        },
    )
    db.add(
        OutboxEvent(
            business_id=business_id,
            topic="order.created",
            payload_json=json.dumps({"order_id": order.id}),
        )
    )
    db.commit()
    return {
        "id": order.id,
        "status": order.status,
        "total_cents": total_cents,
        "variable_cost_cents": variable_cost_cents,
        "contribution_cents": contribution_cents,
        "idempotency_key": key,
        "idempotent_replay": False,
        "cost": cost,
        "channel": {
            "id": channel.id if channel else None,
            "name": channel.name if channel else "Direto",
            **channel_cost,
        },
    }
