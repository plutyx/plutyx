from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import DateTime, ForeignKey, Index, Integer, UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base
from .models import Order, OrderItem, RecipeItem, utcnow


class OrderCompletionSnapshot(Base):
    __tablename__ = "order_completion_snapshots"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_order_completion_snapshot_order"),
        Index("ix_order_completion_snapshots_business_created", "business_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class OrderRecipeSnapshot(Base):
    __tablename__ = "order_recipe_snapshots"
    __table_args__ = (
        UniqueConstraint("order_item_id", "ingredient_id", name="uq_order_recipe_snapshot_item_ingredient"),
        Index("ix_order_recipe_snapshots_business_order", "business_id", "order_id"),
        Index("ix_order_recipe_snapshots_order_ingredient", "order_id", "ingredient_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), index=True)
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id", ondelete="RESTRICT"), index=True)
    ordered_quantity: Mapped[int] = mapped_column(Integer)
    qty_per_unit_milliunits: Mapped[int] = mapped_column(Integer)
    total_qty_milliunits: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


def snapshot_order_recipe(db: Session, business_id: int, order_id: int) -> dict:
    """Freeze the recipe actually used when an order is completed.

    The marker row is created even for an order with no recipe rows. This lets
    downstream calculations distinguish a captured empty recipe from a legacy
    order that predates recipe snapshots.
    """
    order = db.get(Order, order_id)
    if not order or order.business_id != business_id:
        raise HTTPException(404, "Pedido não encontrado")

    existing = db.scalar(select(OrderCompletionSnapshot).where(
        OrderCompletionSnapshot.business_id == business_id,
        OrderCompletionSnapshot.order_id == order_id,
    ))
    if existing:
        count = db.scalar(select(OrderRecipeSnapshot.id).where(
            OrderRecipeSnapshot.business_id == business_id,
            OrderRecipeSnapshot.order_id == order_id,
        ).limit(1))
        return {"captured": False, "replay": True, "has_recipe_rows": bool(count)}

    marker = OrderCompletionSnapshot(business_id=business_id, order_id=order_id)
    db.add(marker)

    items = db.scalars(select(OrderItem).where(
        OrderItem.business_id == business_id,
        OrderItem.order_id == order_id,
    )).all()
    rows = 0
    for item in items:
        recipe = db.scalars(select(RecipeItem).where(RecipeItem.product_id == item.product_id)).all()
        for recipe_item in recipe:
            per_unit = recipe_item.qty_used_milliunits
            db.add(OrderRecipeSnapshot(
                business_id=business_id,
                order_id=order_id,
                order_item_id=item.id,
                product_id=item.product_id,
                ingredient_id=recipe_item.ingredient_id,
                ordered_quantity=item.quantity,
                qty_per_unit_milliunits=per_unit,
                total_qty_milliunits=per_unit * item.quantity,
            ))
            rows += 1
    db.flush()
    return {"captured": True, "replay": False, "recipe_rows": rows}


def theoretical_usage_for_orders(
    db: Session,
    business_id: int,
    order_ids: tuple[int, ...],
    ingredient_id: int,
) -> dict:
    """Return historical theoretical usage using frozen recipes when available.

    Legacy orders without a completion marker fall back to the current recipe,
    and the caller can lower the confidence label accordingly.
    """
    if not order_ids:
        return {
            "qty_milliunits": 0,
            "snapshot_orders": 0,
            "legacy_orders": 0,
            "confidence": "high",
            "method": "completion_recipe_snapshots",
        }

    markers = db.scalars(select(OrderCompletionSnapshot).where(
        OrderCompletionSnapshot.business_id == business_id,
        OrderCompletionSnapshot.order_id.in_(order_ids),
    )).all()
    snapped_ids = {row.order_id for row in markers}

    snapshot_qty = 0
    if snapped_ids:
        rows = db.scalars(select(OrderRecipeSnapshot).where(
            OrderRecipeSnapshot.business_id == business_id,
            OrderRecipeSnapshot.order_id.in_(tuple(snapped_ids)),
            OrderRecipeSnapshot.ingredient_id == ingredient_id,
        )).all()
        snapshot_qty = sum(row.total_qty_milliunits for row in rows)

    legacy_ids = tuple(order_id for order_id in order_ids if order_id not in snapped_ids)
    legacy_qty = 0
    if legacy_ids:
        items = db.scalars(select(OrderItem).where(
            OrderItem.business_id == business_id,
            OrderItem.order_id.in_(legacy_ids),
        )).all()
        recipe_qty_by_product: dict[int, int] = {}
        for item in items:
            if item.product_id not in recipe_qty_by_product:
                recipe = db.scalar(select(RecipeItem).where(
                    RecipeItem.product_id == item.product_id,
                    RecipeItem.ingredient_id == ingredient_id,
                ))
                recipe_qty_by_product[item.product_id] = recipe.qty_used_milliunits if recipe else 0
            legacy_qty += recipe_qty_by_product[item.product_id] * item.quantity

    return {
        "qty_milliunits": snapshot_qty + legacy_qty,
        "snapshot_orders": len(snapped_ids),
        "legacy_orders": len(legacy_ids),
        "confidence": "high" if not legacy_ids else "medium",
        "method": "completion_recipe_snapshots" if not legacy_ids else "snapshots_plus_legacy_current_recipe_fallback",
    }
