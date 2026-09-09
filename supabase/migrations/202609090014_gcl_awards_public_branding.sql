-- Preserve legacy internal identifiers used by award enforcement while cleaning customer-facing copy.
update sac.award_definitions
set description='Reconhecimento principal GCL baseado em score oficial validado.'
where award_code='CONVERSION_EXCELLENCE';

update sac.award_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'public_score_label',case when score_source='official_sac_score' then 'GCL Score oficial' else score_source end,
  'public_brand','Global Conversion League'
)
where active;
