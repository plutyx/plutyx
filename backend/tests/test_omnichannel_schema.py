import pytest
from sqlalchemy import inspect, text

from app.db import engine


def test_omnichannel_event_schema_is_present_in_postgres_production():
    if engine.dialect.name != "postgresql":
        pytest.skip("production schema contract is PostgreSQL-only")

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert "integration_connections" in tables
    assert "integration_events" in tables

    event_columns = {c["name"] for c in inspector.get_columns("integration_events")}
    for required in {
        "provider",
        "external_event_id",
        "external_order_id",
        "signature_verified",
        "payload_sha256",
        "canonical_event_type",
        "normalized_json",
        "canonical_order_id",
        "status",
        "attempts",
        "next_retry_at",
    }:
        assert required in event_columns

    connection_indexes = {i["name"] for i in inspector.get_indexes("integration_connections")}
    event_indexes = {i["name"] for i in inspector.get_indexes("integration_events")}
    assert "uq_integration_connections_business_provider_account" in connection_indexes
    assert "uq_integration_events_business_provider_event" in event_indexes
    assert "ix_integration_events_business_status_received" in event_indexes
    assert "ix_integration_events_retry" in event_indexes

    with engine.connect() as conn:
        rls_connections = conn.execute(
            text("select relrowsecurity from pg_class where oid='public.integration_connections'::regclass")
        ).scalar_one()
        rls_events = conn.execute(
            text("select relrowsecurity from pg_class where oid='public.integration_events'::regclass")
        ).scalar_one()
        ingest_definition = conn.execute(
            text("select pg_get_functiondef('public.c360_ingest_integration_event(bigint,text,text,text,text,timestamptz,text,text,boolean,bigint)'::regprocedure)")
        ).scalar_one()
        mark_definition = conn.execute(
            text("select pg_get_functiondef('public.c360_mark_integration_event(bigint,text,text,text,bigint,text,timestamptz)'::regprocedure)")
        ).scalar_one()

    assert rls_connections is True
    assert rls_events is True
    assert "idempotent_replay" in ingest_definition
    assert "pg_advisory_xact_lock" in ingest_definition
    assert "signature_verified" in ingest_definition
    assert "dead_letter" in mark_definition
    assert "integration.event." in mark_definition
