from fastapi.testclient import TestClient

from app.main import app


def auth(client, email, name):
    response = client.post('/auth/signup', json={
        'email': email,
        'password': 'senha-super-segura-123',
        'full_name': name,
    })
    assert response.status_code == 201, response.text
    return {'Authorization': f"Bearer {response.json()['access_token']}"}


def test_market_intelligence_customer_journey():
    with TestClient(app) as client:
        owner = auth(client, 'insights-owner@example.com', 'Owner Insights')
        business_id = client.post('/businesses', headers=owner, json={
            'name': 'Cozinha Intelligence',
            'city': 'Mogi das Cruzes',
        }).json()['id']

        ingredient = client.post(f'/businesses/{business_id}/ingredients', headers=owner, json={
            'name': 'Frango Insights',
            'unit': 'g',
            'price_cents': 1000,
            'purchase_qty_milliunits': 1000,
            'usable_qty_milliunits': 1000,
        })
        assert ingredient.status_code == 201, ingredient.text
        ingredient_id = ingredient.json()['id']

        first_purchase = client.post(f'/businesses/{business_id}/purchases', headers=owner, json={
            'ingredient_id': ingredient_id,
            'quantity_milliunits': 1000,
            'total_cents': 1000,
            'idempotency_key': 'insights-purchase-1',
        })
        assert first_purchase.status_code == 201, first_purchase.text

        first_count = client.post(f'/businesses/{business_id}/inventory/counts', headers=owner, json={
            'ingredient_id': ingredient_id,
            'counted_milliunits': 1000,
            'note': 'abertura',
        })
        assert first_count.status_code == 201, first_count.text

        second_purchase = client.post(f'/businesses/{business_id}/purchases', headers=owner, json={
            'ingredient_id': ingredient_id,
            'quantity_milliunits': 500,
            'total_cents': 750,
            'idempotency_key': 'insights-purchase-2',
        })
        assert second_purchase.status_code == 201, second_purchase.text

        product = client.post(f'/businesses/{business_id}/products', headers=owner, json={
            'name': 'Wrap Intelligence',
            'category': 'wrap',
            'units_per_batch': 10,
            'packaging_cents_per_unit': 100,
            'energy_cents_per_batch': 100,
            'labor_cents_per_batch': 200,
        })
        assert product.status_code == 201, product.text
        product_id = product.json()['id']

        recipe = client.put(
            f'/businesses/{business_id}/products/{product_id}/recipe/{ingredient_id}',
            headers=owner,
            json={'ingredient_id': ingredient_id, 'qty_used_milliunits': 200},
        )
        assert recipe.status_code == 200, recipe.text

        order = client.post(f'/businesses/{business_id}/orders', headers=owner, json={
            'total_cents': 4000,
            'variable_cost_cents': 1600,
            'source': 'whatsapp',
            'paid': True,
            'idempotency_key': 'insights-order-1',
        })
        assert order.status_code == 201, order.text
        order_id = order.json()['id']

        item = client.post(f'/businesses/{business_id}/orders/{order_id}/items', headers=owner, json={
            'product_id': product_id,
            'quantity': 2,
            'unit_price_cents': 2000,
            'unit_variable_cost_cents': 800,
        })
        assert item.status_code == 201, item.text

        completed = client.patch(f'/businesses/{business_id}/orders/{order_id}/status', headers=owner, json={
            'status': 'completed',
            'expected_version': 1,
        })
        assert completed.status_code == 200, completed.text
        assert completed.json()['inventory']['consumed'] is True
        assert completed.json()['inventory']['recipe_snapshot']['captured'] is True
        assert completed.json()['inventory']['recipe_snapshot']['recipe_rows'] == 1

        # A ficha técnica muda depois da venda. A variação histórica deve continuar
        # usando os 200 g/unidade congelados no momento da conclusão, não os 350 g atuais.
        recipe_changed = client.put(
            f'/businesses/{business_id}/products/{product_id}/recipe/{ingredient_id}',
            headers=owner,
            json={'ingredient_id': ingredient_id, 'qty_used_milliunits': 350},
        )
        assert recipe_changed.status_code == 200, recipe_changed.text

        second_count = client.post(f'/businesses/{business_id}/inventory/counts', headers=owner, json={
            'ingredient_id': ingredient_id,
            'counted_milliunits': 1050,
            'note': 'fechamento físico',
        })
        assert second_count.status_code == 201, second_count.text
        assert second_count.json()['adjustment_milliunits'] == -50

        variance = client.get(f'/businesses/{business_id}/inventory/variance', headers=owner)
        assert variance.status_code == 200, variance.text
        assert variance.json()['count'] == 1
        row = variance.json()['ingredients'][0]
        assert row['purchased_milliunits'] == 500
        assert row['theoretical_usage_milliunits'] == 400
        assert row['variance_milliunits'] == -50
        assert row['signal'] == 'shrink'
        assert row['confidence'] == 'high'
        assert row['snapshot_orders'] == 1
        assert row['legacy_orders'] == 0
        assert row['method'] == 'completion_recipe_snapshots'

        quality = client.get(f'/businesses/{business_id}/data-quality', headers=owner)
        assert quality.status_code == 200, quality.text
        codes = {issue['code'] for issue in quality.json()['issues']}
        assert 'completed_order_without_recipe_snapshot' not in codes
        assert quality.json()['counts']['completed_orders_with_recipe_snapshot'] == 1

        menu = client.get(f'/businesses/{business_id}/insights/menu-engineering?days=30', headers=owner)
        assert menu.status_code == 200, menu.text
        assert menu.json()['products'][0]['classification'] == 'champion'
        assert menu.json()['products'][0]['contribution_cents'] == 2400

        movers = client.get(f'/businesses/{business_id}/insights/price-movers?days=30', headers=owner)
        assert movers.status_code == 200, movers.text
        assert movers.json()['ingredients'][0]['change_bps'] == 5000

        control = client.get(f'/businesses/{business_id}/insights/daily-control?days=30', headers=owner)
        assert control.status_code == 200, control.text
        assert control.json()['summary']['revenue_cents'] == 4000
        assert control.json()['summary']['contribution_cents'] == 2400

        brief = client.get(f'/businesses/{business_id}/insights/owner-brief', headers=owner)
        assert brief.status_code == 200, brief.text
        assert brief.json()['signals']['price_increases_ge_5pct'] >= 1
        assert len(brief.json()['actions']) >= 1

        outsider = auth(client, 'insights-outsider@example.com', 'Outsider')
        denied = client.get(f'/businesses/{business_id}/insights/owner-brief', headers=outsider)
        assert denied.status_code == 403

        ready = client.get('/ready')
        assert ready.status_code == 200
        assert ready.json()['database'] == 'reachable'

        readyz = client.get('/readyz')
        assert readyz.status_code == 200, readyz.text
        assert readyz.json()['release'] == '0.9.0'
