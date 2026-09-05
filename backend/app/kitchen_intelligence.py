from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user
from .db import get_db
from .models import Ingredient, Membership, Order, OrderItem, Product, RecipeItem, User


router = APIRouter(tags=["kitchen-intelligence-v27"])
PREP_STATUSES = ("new", "confirmed", "production")


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


@router.get("/businesses/{business_id}/kitchen/prep")
def kitchen_prep(
    business_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Explode a fila aberta em ingredientes/componentes sem movimentar estoque."""
    _member_or_403(db, user, business_id)

    orders = db.scalars(
        select(Order).where(
            Order.business_id == business_id,
            Order.status.in_(PREP_STATUSES),
        )
    ).all()
    order_ids = tuple(order.id for order in orders)
    if not order_ids:
        return {
            "prep_orders": 0,
            "prep_units": 0,
            "mapped_units": 0,
            "unmapped_units": 0,
            "recipe_coverage_percent": 100,
            "components": [],
            "unmapped_products": [],
        }

    item_rows = db.execute(
        select(OrderItem, Product)
        .join(Product, Product.id == OrderItem.product_id)
        .where(
            OrderItem.business_id == business_id,
            OrderItem.order_id.in_(order_ids),
        )
    ).all()

    product_units: dict[int, int] = {}
    product_orders: dict[int, set[int]] = {}
    product_names: dict[int, str] = {}
    for item, product in item_rows:
        qty = max(0, int(item.quantity or 0))
        product_units[item.product_id] = product_units.get(item.product_id, 0) + qty
        product_orders.setdefault(item.product_id, set()).add(item.order_id)
        product_names[item.product_id] = product.name

    product_ids = tuple(product_units.keys())
    recipe_rows = db.execute(
        select(RecipeItem, Ingredient)
        .join(Ingredient, Ingredient.id == RecipeItem.ingredient_id)
        .where(RecipeItem.product_id.in_(product_ids))
    ).all() if product_ids else []

    recipes: dict[int, list[tuple[RecipeItem, Ingredient]]] = {}
    for recipe, ingredient in recipe_rows:
        recipes.setdefault(recipe.product_id, []).append((recipe, ingredient))

    components: dict[int, dict] = {}
    unmapped_products = []
    mapped_units = 0
    unmapped_units = 0

    for product_id, units in product_units.items():
        rows = recipes.get(product_id, [])
        if not rows:
            unmapped_units += units
            unmapped_products.append({
                "product_id": product_id,
                "name": product_names.get(product_id, f"Produto #{product_id}"),
                "units": units,
                "order_ids": sorted(product_orders.get(product_id, set())),
            })
            continue

        mapped_units += units
        for recipe, ingredient in rows:
            required = max(0, int(recipe.qty_used_milliunits or 0)) * units
            current = components.setdefault(ingredient.id, {
                "ingredient_id": ingredient.id,
                "name": ingredient.name,
                "unit": ingredient.unit,
                "required_milliunits": 0,
                "on_hand_milliunits": int(ingredient.on_hand_milliunits or 0),
                "par_level_milliunits": int(ingredient.par_level_milliunits or 0),
                "reorder_target_milliunits": int(ingredient.reorder_target_milliunits or 0),
                "order_ids": set(),
                "products": {},
            })
            current["required_milliunits"] += required
            current["order_ids"].update(product_orders.get(product_id, set()))
            product_part = current["products"].setdefault(product_id, {
                "product_id": product_id,
                "name": product_names.get(product_id, f"Produto #{product_id}"),
                "units": 0,
                "required_milliunits": 0,
            })
            product_part["units"] += units
            product_part["required_milliunits"] += required

    result = []
    for component in components.values():
        required = component["required_milliunits"]
        on_hand = component["on_hand_milliunits"]
        projected = on_hand - required
        shortage = max(0, -projected)
        par = component["par_level_milliunits"]
        target = component["reorder_target_milliunits"]
        below_par_after = par > 0 and projected < par
        suggested_purchase = 0
        if target > 0 and projected < target:
            suggested_purchase = max(0, target - projected)
        elif shortage:
            suggested_purchase = shortage
        status = "shortage" if shortage else "below_par" if below_par_after else "covered"
        result.append({
            **{k: v for k, v in component.items() if k not in {"order_ids", "products"}},
            "projected_after_milliunits": projected,
            "shortage_milliunits": shortage,
            "below_par_after": below_par_after,
            "suggested_purchase_milliunits": suggested_purchase,
            "status": status,
            "order_ids": sorted(component["order_ids"]),
            "products": sorted(component["products"].values(), key=lambda row: (-row["required_milliunits"], row["name"])),
        })

    severity = {"shortage": 0, "below_par": 1, "covered": 2}
    result.sort(key=lambda row: (severity[row["status"]], -row["required_milliunits"], row["name"]))
    prep_units = mapped_units + unmapped_units
    coverage = round(mapped_units * 100 / prep_units) if prep_units else 100

    return {
        "prep_orders": len(orders),
        "prep_units": prep_units,
        "mapped_units": mapped_units,
        "unmapped_units": unmapped_units,
        "recipe_coverage_percent": coverage,
        "components": result,
        "unmapped_products": sorted(unmapped_products, key=lambda row: (-row["units"], row["name"])),
    }
