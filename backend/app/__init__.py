"""Cozinha 360 OS backend package."""

# Security routes are attached to the market router during package import so
# hardened auth endpoints are registered before legacy-compatible routes in main.
from .market import router as market_router
from .security import router as security_router

market_router.include_router(security_router)
