begin;

create index if not exists ix_audit_logs_actor_user on audit_logs(actor_user_id);
create index if not exists ix_losses_ingredient on losses(ingredient_id);
create index if not exists ix_orders_channel on orders(channel_id);
create index if not exists ix_orders_customer on orders(customer_id);
create index if not exists ix_product_channel_prices_channel on product_channel_prices(channel_id);
create index if not exists ix_purchases_supplier on purchases(supplier_id);
create index if not exists ix_recipe_items_ingredient on recipe_items(ingredient_id);
create index if not exists ix_team_invites_created_by on team_invites(created_by_user_id);

commit;
