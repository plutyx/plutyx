"""Cozinha 360 OS backend package."""

# Auxiliary routers are attached to the market router during package import so
# hardened auth, intelligence and production-readiness endpoints are registered
# before the legacy-compatible routes in main.
from . import market as market_module
from .market import router as market_router
from .security import router as security_router
from .account_security import router as account_security_router
from .snapshots import snapshot_order_recipe

# Freeze the recipe at the same transaction boundary used to consume inventory.
# main imports consume_order_inventory only after this package initializer runs,
# so the wrapped function becomes the canonical completion path everywhere.
_original_consume_order_inventory = market_module.consume_order_inventory


def _consume_order_inventory_with_snapshot(db, business_id: int, order_id: int):
    snapshot = snapshot_order_recipe(db, business_id, order_id)
    result = _original_consume_order_inventory(db, business_id, order_id)
    return {**result, "recipe_snapshot": snapshot}


market_module.consume_order_inventory = _consume_order_inventory_with_snapshot

from .insights import router as insights_router
from .ops import router as ops_router
from .simplicity import router as simplicity_router
from .portfolio import router as portfolio_router
from .smart_cmv import router as smart_cmv_router

market_router.include_router(security_router)
market_router.include_router(account_security_router)
market_router.include_router(insights_router)
market_router.include_router(ops_router)
market_router.include_router(simplicity_router)
market_router.include_router(portfolio_router)
market_router.include_router(smart_cmv_router)
