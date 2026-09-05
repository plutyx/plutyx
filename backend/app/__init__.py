"""Cozinha 360 OS backend package."""

# Auxiliary routers are attached to the market router during package import so
# hardened auth and market-intelligence endpoints are registered before main.
from .market import router as market_router
from .security import router as security_router
from .insights import router as insights_router

market_router.include_router(security_router)
market_router.include_router(insights_router)
