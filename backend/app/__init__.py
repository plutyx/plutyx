"""Cozinha 360 OS backend package."""

# Auxiliary routers are attached to the market router during package import so
# hardened auth, intelligence and production-readiness endpoints are registered
# before the legacy-compatible routes in main.
from .market import router as market_router
from .security import router as security_router
from .insights import router as insights_router
from .ops import router as ops_router

market_router.include_router(security_router)
market_router.include_router(insights_router)
market_router.include_router(ops_router)
