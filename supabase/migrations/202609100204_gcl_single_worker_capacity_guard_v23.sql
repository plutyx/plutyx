-- Match logical concurrency to the currently deployed single 512 MiB Render worker.
-- Queue remains multi-user; heavy browser execution is serialized. Paid work keeps queue priority.
update sac.runtime_capacity
set global_slots=1,
    reserved_paid_slots=0,
    dispatch_batch=1,
    updated_at=now()
where subsystem='fullscan';

-- Background benchmark deepening stays paused until the bounded worker release is confirmed live.
update sac.benchmark_deepening_policy
set enabled=false,
    updated_at=now()
where id=1;

comment on table sac.runtime_capacity is 'Logical admission and dispatch limits. Current fullscan settings intentionally serialize browser work to match one 512 MiB Render instance; paid jobs retain queue priority.';
