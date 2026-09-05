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
        roles = {
            row[0]
            for row in conn.execute(
                text("select rolname from pg_roles where rolname in ('anon','authenticated')")
            ).all()
        }
        privileges = {}
        for role in roles:
            privileges[role] = conn.execute(
                text(
                    "select has_function_privilege(:role, "
                    "'public.c360_customer_lifecycle(bigint,integer)', 'EXECUTE')"
                ),
                {"role": role},
            ).scalar_one()

    for expected in ("prospect", "new", "repeat", "dormant", "do_not_contact", "win_back", "second_order"):
        assert expected in definition
    assert "consent_marketing" in definition
    assert "opted_out_at" in definition
    for role in roles:
        assert privileges[role] is False
