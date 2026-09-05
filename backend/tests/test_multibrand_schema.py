import pytest
from sqlalchemy import inspect, text

from app.db import engine


def test_multibrand_schema_is_present_in_postgres_production():
    if engine.dialect.name != "postgresql":
        pytest.skip("production schema contract is PostgreSQL-only")

    inspector = inspect(engine)
    assert "brands" in inspector.get_table_names()

    product_columns = {c["name"] for c in inspector.get_columns("products")}
    order_columns = {c["name"] for c in inspector.get_columns("orders")}
    assert "brand_id" in product_columns
    assert "brand_id" in order_columns

    brand_indexes = {i["name"] for i in inspector.get_indexes("brands")}
    assert "ix_brands_business" in brand_indexes
    assert "uq_brands_business_name_active" in brand_indexes

    with engine.connect() as conn:
        rls = conn.execute(text("select relrowsecurity from pg_class where oid='public.brands'::regclass")).scalar_one()
        definition = conn.execute(text("select pg_get_functiondef('public.c360_create_order(bigint,text,boolean,bigint,bigint,jsonb,text)'::regprocedure)")).scalar_one()

    assert rls is True
    assert "brand_id" in definition
    assert "PRODUCT_NOT_FOUND" in definition
