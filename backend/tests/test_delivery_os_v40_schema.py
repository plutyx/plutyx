import pytest
from sqlalchemy import inspect, text

from app.db import engine


def test_delivery_os_v40_schema_is_present_in_postgres_production():
    if engine.dialect.name != "postgresql":
        pytest.skip("production schema contract is PostgreSQL-only")

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    for table in {
        "brands",
        "delivery_zones",
        "delivery_drivers",
        "delivery_promos",
        "loyalty_programs",
        "deliveries",
    }:
        assert table in tables

    brand_columns = {c["name"] for c in inspector.get_columns("brands")}
    assert {"slug", "primary_channel", "sort_order"} <= brand_columns

    delivery_columns = {c["name"] for c in inspector.get_columns("deliveries")}
    assert {
        "business_id",
        "order_id",
        "driver_id",
        "zone_id",
        "status",
        "fee_cents",
        "tracking_token",
        "version",
    } <= delivery_columns

    delivery_indexes = {i["name"] for i in inspector.get_indexes("deliveries")}
    assert "ix_deliveries_business_status" in delivery_indexes
    assert "ix_deliveries_driver_status" in delivery_indexes

    with engine.connect() as conn:
        for table in ["delivery_zones", "delivery_drivers", "delivery_promos", "loyalty_programs", "deliveries"]:
            rls = conn.execute(
                text("select relrowsecurity from pg_class where oid=to_regclass(:table_name)"),
                {"table_name": f"public.{table}"},
            ).scalar_one()
            assert rls is True

        direct_grants = conn.execute(
            text(
                """
                select count(*)
                from information_schema.role_table_grants
                where table_schema='public'
                  and table_name in ('delivery_zones','delivery_drivers','delivery_promos','loyalty_programs','deliveries')
                  and grantee in ('anon','authenticated')
                """
            )
        ).scalar_one()

    assert direct_grants == 0
