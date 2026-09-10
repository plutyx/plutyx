update sac.platform_branding
set labs_name='GCL Intelligence', updated_at=now()
where id=1 and labs_name is distinct from 'GCL Intelligence';

comment on column sac.platform_branding.labs_name is 'Legacy column name retained for API compatibility. Canonical public value is GCL Intelligence.';
