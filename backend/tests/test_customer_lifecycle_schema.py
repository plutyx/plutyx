import pytest
from sqlalchemy import inspect, text

from app.db import engine


def test_customer_lifecycle_contract_in_postgres_production():
    if engine.dialect.name != "postgresql":
        pytest.skip("production schema contract is PostgreSQL-only")

    inspector = inspect(engine)
    order_indexes = {i["name"] for i in inspector.get_indexes("orders")}
    assert "ix_orders_business_customer_completed" in order_indexes

    with engine.connect() as conn:
        definition = conn.execute(
            text("select pg_get_functiondef('public.c360_customer_lifecycle(bigint,integer)'::regprocedure)")
        ).scalar_one()
        authenticated_execute = conn.execute(text("""
            select has_function_privilege(
              'authenticated',
              'public.c360_customer_lifecycle(bigint,integer)',
              'EXECUTE'
            )
        """)).scalar_one()
        anon_execute = conn.execute(text("""
            select has_function_privilege(
              'anon',
              'public.c360_customer_lifecycle(bigint,integer)',
              'EXECUTE'
            )
        """)).scalar_one()

    for expected in ("prospect", "new", "repeat", "dormant", "do_not_contact", "win_back", "second_order"):
        assert expected in definition
    assert "consent_marketing" in definition
    assert "opted_out_at" in definition
    assert authenticated_execute is False
    assert anon_execute is False
