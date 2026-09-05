from datetime import timedelta

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import Order, utcnow


def auth(client):
    response = client.post('/auth/signup', json={
        'email': 'completion-time-owner@example.com',
        'password': 'senha-super-segura-123',
        'full_name': 'Completion Time Owner',
    })
    assert response.status_code == 201, response.text
    return {'Authorization': f"Bearer {response.json()['access_token']}"}


def test_inventory_variance_uses_completion_time_not_order_creation_time():
    with TestClient(app) as client:
        owner = auth(client)
        business_id = client.post('/businesses', headers=owner, json={
            'name': 'Cozinha Completion Timing',
            'city': 'Mogi das Cruzes',
        }).json()['id']

        ingredient = client.post(f'/businesses/{business_id}/ingredients', headers=owner, json={
            'name': 'Frango Timing',
            'unit': 'g',
            'price_cents': 1000,
            'purchase_qty_milliunits': 1000,
            'usable_qty_milliunits': 1000,
        })
        assert ingredient.status_code == 201, ingredient.text
        ingredient_id = ingredient.json()['id']

        purchase = client.post(f'/businesses/{business_id}/purchases', headers=owner, json={
            'ingredient_id': ingredient_id,
            'quantity_milliunits': 1000,
            'total_cents': 1000,
            'idempotency_key': 'timing-purchase-1',
        })
        assert purchase.status_code == 201, purchase.text

        product = client.post(f'/businesses/{business_id}/products', headers=owner, json={
            'name': 'Wrap Timing',
            'category': 'wrap',
            'units_per_batch': 1,
            'packaging_cents_per_unit': 0,
            'energy_cents_per_batch': 0,
            'labor_cents_per_batch': 0,
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
            'source': 'manual',
            'paid': True,
            'idempotency_key': 'timing-order-1',
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

        # Simulate an order placed yesterday but only completed after today's
        # opening physical count. created_at must not decide today's consumption.
        with SessionLocal() as db:
            row = db.get(Order, order_id)
            row.created_at = utcnow() - timedelta(days=1)
            db.commit()

        opening = client.post(f'/businesses/{business_id}/inventory/counts', headers=owner, json={
            'ingredient_id': ingredient_id,
            'counted_milliunits': 1000,
            'note': 'abertura de hoje',
        })
        assert opening.status_code == 201, opening.text

        completed = client.patch(f'/businesses/{business_id}/orders/{order_id}/status', headers=owner, json={
            'status': 'completed',
            'expected_version': 1,
        })
        assert completed.status_code == 200, completed.text
        assert completed.json()['inventory']['consumed'] is True
        assert completed.json()['inventory']['recipe_snapshot']['captured'] is True

        closing = client.post(f'/businesses/{business_id}/inventory/counts', headers=owner, json={
            'ingredient_id': ingredient_id,
            'counted_milliunits': 600,
            'note': 'fechamento de hoje',
        })
        assert closing.status_code == 201, closing.text

        variance = client.get(f'/businesses/{business_id}/inventory/variance', headers=owner)
        assert variance.status_code == 200, variance.text
        body = variance.json()
        assert body['count'] == 1
        row = body['ingredients'][0]
        assert row['theoretical_usage_milliunits'] == 400
        assert row['expected_closing_milliunits'] == 600
        assert row['physical_closing_milliunits'] == 600
        assert row['variance_milliunits'] == 0
        assert row['signal'] == 'balanced'
        assert row['timing_basis'] == 'completed_at'
        assert row['legacy_timing_orders'] == 0
        assert row['snapshot_orders'] == 1
