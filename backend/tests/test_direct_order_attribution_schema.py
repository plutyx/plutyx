import pytest
from sqlalchemy import inspect, text

from app.db import engine


def test_direct_order_and_attribution_contract_in_postgres_production():
    if engine.dialect.name != "postgresql":
        pytest.skip("production schema contract is PostgreSQL-only")

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert {"storefronts", "order_attributions", "conversion_events"}.issubset(tables)

    storefront_indexes = {i["name"] for i in inspector.get_indexes("storefronts")}
    attribution_indexes = {i["name"] for i in inspector.get_indexes("order_attributions")}
    conversion_indexes = {i["name"] for i in inspector.get_indexes("conversion_events")}
    assert "uq_storefronts_slug" in storefront_indexes
    assert "ix_order_attributions_campaign" in attribution_indexes
    assert "ix_conversion_events_delivery" in conversion_indexes

    with engine.connect() as conn:
        create_direct = conn.execute(
            text("select pg_get_functiondef('public.c360_create_direct_order(text,text,jsonb,text,text,text,boolean,text,text,text,text,text,text,text,text,text,text)'::regprocedure)")
        ).scalar_one()
        campaign = conn.execute(
            text("select pg_get_functiondef('public.c360_campaign_attribution(bigint,integer)'::regprocedure)")
        ).scalar_one()
        trigger_count = conn.execute(text("""
            select count(*)
            from pg_trigger t
            join pg_class c on c.oid=t.tgrelid
            join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relname='orders'
              and t.tgname='trg_orders_purchase_conversion' and not t.tgisinternal
        """)).scalar_one()
        public_execute = conn.execute(text("""
            select has_function_privilege(
              'public',
              'public.c360_campaign_attribution(bigint,integer)',
              'EXECUTE'
            )
        """)).scalar_one()

    for expected in (
        "PRODUCT_PRICE_NOT_CONFIGURED",
        "PRODUCT_NOT_IN_STOREFRONT",
        "direct.order.created",
        "order_attributions",
    ):
        assert expected in create_direct
    assert "contribution_after_media_cents" in campaign
    assert trigger_count == 1
    assert public_execute is False
