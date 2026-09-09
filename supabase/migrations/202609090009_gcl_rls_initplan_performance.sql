-- Supabase/Postgres performance hardening.
-- Wrap auth helpers in scalar subqueries so they are initialized once per statement
-- instead of being re-evaluated for every row. Policy semantics and roles stay unchanged.
do $$
declare
  r record;
  q text;
  w text;
  stmt text;
begin
  for r in
    select n.nspname as schema_name,
           c.relname as table_name,
           p.polname as policy_name,
           pg_get_expr(p.polqual,p.polrelid) as qual,
           pg_get_expr(p.polwithcheck,p.polrelid) as with_check
    from pg_policy p
    join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='sac'
      and (
        coalesce(pg_get_expr(p.polqual,p.polrelid),'') ~ 'auth\.(uid|role)\(\)'
        or coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') ~ 'auth\.(uid|role)\(\)'
      )
  loop
    q:=r.qual;
    w:=r.with_check;
    if q is not null then
      q:=replace(replace(q,'auth.uid()','(SELECT auth.uid())'),'auth.role()','(SELECT auth.role())');
    end if;
    if w is not null then
      w:=replace(replace(w,'auth.uid()','(SELECT auth.uid())'),'auth.role()','(SELECT auth.role())');
    end if;

    stmt:=format('alter policy %I on %I.%I',r.policy_name,r.schema_name,r.table_name);
    if q is not null then stmt:=stmt||format(' using (%s)',q); end if;
    if w is not null then stmt:=stmt||format(' with check (%s)',w); end if;
    execute stmt;
  end loop;
end;
$$;
