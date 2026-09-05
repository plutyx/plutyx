from pathlib import Path


def test_postgrest_hardening_migration_is_versioned():
    path = Path(__file__).resolve().parents[2] / 'supabase' / 'migrations' / '202609050004_lock_postgrest.sql'
    text = path.read_text(encoding='utf-8').lower()
    assert 'enable row level security' in text
    assert "pg_roles where rolname='anon'" in text
    assert "pg_roles where rolname='authenticated'" in text
    assert 'alter function public.touch_updated_at() set search_path = public' in text
