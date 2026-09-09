-- Final customer-facing naming cleanup. Stable product codes remain untouched for billing/webhook compatibility.
update sac.commercial_products set name='Global Conversion Awards 2026 · Inscrição por Site',updated_at=now() where product_code='sac_awards_entry_2026';
update sac.commercial_products set name='GCL Community',updated_at=now() where product_code='sac_community_monthly';
update sac.commercial_products set name='GCL Complete Pass 2026 · Entrada',updated_at=now() where product_code='sac_complete_entry_2026';
update sac.commercial_products set name='GCL Complete Pass · Ranking + Community',updated_at=now() where product_code='sac_complete_monthly';
update sac.commercial_products set name='GCL Ranking + Community',updated_at=now() where product_code='sac_ranking_community_monthly';
update sac.commercial_products set name='Global Conversion League · Ranking',updated_at=now() where product_code='sac_ranking_monthly';
update sac.commercial_products set name='GCL Ranking + Community · Annual',updated_at=now() where product_code='sac_membership_annual';
update sac.commercial_products set name='GCL Ranking + Community',updated_at=now() where product_code='sac_membership_monthly';

update sac.market_listings
set seller_name='GCL Market',
    verification_note=replace(coalesce(verification_note,''),'SAC','GCL'),
    updated_at=now()
where seller_name='Sites de Alta Conversão' or coalesce(verification_note,'') ilike '%SAC%';

update sac.community_badge_definitions
set description=replace(description,'Raio-X SAC','GCL Conversion Audit')
where description like '%Raio-X SAC%';

update sac.community_missions
set title='Faça sua primeira GCL Conversion Audit',
    description=coalesce(nullif(description,''),'Conclua uma auditoria válida do seu site e estabeleça sua linha de base.')
where code='FIRST_AUDIT';
