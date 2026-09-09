-- Keep stable product codes for checkout/webhook compatibility; update only customer-facing names.
update sac.commercial_products set name='GCL Conversion Audit · Análise Completa', updated_at=now() where product_code='sac_analysis_2026';
update sac.commercial_products set name='Global Conversion Awards 2026 · Inscrição por site', updated_at=now() where product_code='sac_awards_2026';
update sac.commercial_products set name='GCL Complete Pass 2026', updated_at=now() where product_code='sac_complete_bundle_2026';
update sac.commercial_products set name='GCL Community', updated_at=now() where product_code='sac_community';
update sac.commercial_products set name='GCL Full Scan', updated_at=now() where product_code='sac_full_scan';
update sac.commercial_products set name='Global Conversion League · Ranking', updated_at=now() where product_code='sac_ranking';
