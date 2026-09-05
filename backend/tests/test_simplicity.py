from fastapi.testclient import TestClient

from app.main import app


def signup(client):
    response = client.post('/auth/signup', json={
        'email': 'simplicity-owner@example.com',
        'password': 'senha-super-segura-123',
        'full_name': 'Simplicity Owner',
    })
    assert response.status_code == 201, response.text
    return {'Authorization': f"Bearer {response.json()['access_token']}"}


def test_first_ten_minutes_and_quick_order_derive_cost_from_recipe():
    with TestClient(app) as client:
        headers = signup(client)
        business = client.post('/businesses', headers=headers, json={
            'name': 'Cozinha Simples',
            'city': 'Mogi das Cruzes',
        })
        assert business.status_code == 201, business.text
        business_id = business.json()['id']

        onboarding = client.get(f'/businesses/{business_id}/onboarding', headers=headers)
        assert onboarding.status_code == 200, onboarding.text
        assert onboarding.json()['progress_percent'] == 0
        assert onboarding.json()['next_step']['code'] == 'ingredient'

        ingredient = client.post(f'/businesses/{business_id}/ingredients', headers=headers, json={
            'name': 'Frango V11',
            'unit': 'g',
            'price_cents': 1000,
            'purchase_qty_milliunits': 1000,
            'usable_qty_milliunits': 1000,
        })
        assert ingredient.status_code == 201, ingredient.text
        ingredient_id = ingredient.json()['id']

        inventory = client.patch(
            f'/businesses/{business_id}/ingredients/{ingredient_id}/inventory',
            headers=headers,
            json={
                'on_hand_milliunits': 5000,
                'par_level_milliunits': 1000,
                'reorder_target_milliunits': 3000,
                'expected_version': 1,
            },
        )
        assert inventory.status_code == 200, inventory.text

        product = client.post(f'/businesses/{business_id}/products', headers=headers, json={
            'name': 'Wrap V11',
            'category': 'wrap',
            'active': True,
            'units_per_batch': 10,
            'packaging_cents_per_unit': 100,
            'energy_cents_per_batch': 100,
            'labor_cents_per_batch': 200,
        })
        assert product.status_code == 201, product.text
        product_id = product.json()['id']

        before_recipe = client.post(f'/businesses/{business_id}/orders/quick', headers=headers, json={
            'product_id': product_id,
            'quantity': 2,
            'unit_price_cents': 2000,
            'idempotency_key': 'quick-before-recipe',
        })
        assert before_recipe.status_code == 422
        assert 'ficha técnica' in before_recipe.json()['detail']

        recipe = client.put(
            f'/businesses/{business_id}/products/{product_id}/recipe/{ingredient_id}',
            headers=headers,
            json={'ingredient_id': ingredient_id, 'qty_used_milliunits': 200},
        )
        assert recipe.status_code == 200, recipe.text

        preview = client.get(
            f'/businesses/{business_id}/products/{product_id}/cost-preview',
            headers=headers,
        )
        assert preview.status_code == 200, preview.text
        cost = preview.json()
        assert cost['ingredients_cents'] == 200
        assert cost['packaging_cents'] == 100
        assert cost['energy_cents'] == 10
        assert cost['labor_cents'] == 20
        assert cost['direct_cost_per_unit_cents'] == 330

        onboarding = client.get(f'/businesses/{business_id}/onboarding', headers=headers)
        assert onboarding.status_code == 200
        assert onboarding.json()['progress_percent'] == 80
        assert onboarding.json()['next_step']['code'] == 'first_order'

        quick = client.post(f'/businesses/{business_id}/orders/quick', headers=headers, json={
            'product_id': product_id,
            'quantity': 2,
            'unit_price_cents': 2000,
            'paid': True,
            'source': 'whatsapp',
            'idempotency_key': 'quick-v11-1',
        })
        assert quick.status_code == 201, quick.text
        body = quick.json()
        assert body['total_cents'] == 4000
        assert body['variable_cost_cents'] == 660
        assert body['contribution_cents'] == 3340
        assert body['cost']['direct_cost_per_unit_cents'] == 330
        order_id = body['id']

        replay = client.post(f'/businesses/{business_id}/orders/quick', headers=headers, json={
            'product_id': product_id,
            'quantity': 2,
            'unit_price_cents': 2000,
            'paid': True,
            'source': 'whatsapp',
            'idempotency_key': 'quick-v11-1',
        })
        assert replay.status_code == 201, replay.text
        assert replay.json()['id'] == order_id
        assert replay.json()['idempotent_replay'] is True

        items = client.get(f'/businesses/{business_id}/orders/{order_id}/items', headers=headers)
        assert items.status_code == 200
        assert len(items.json()) == 1
        assert items.json()[0]['unit_variable_cost_cents'] == 330

        finance = client.get(f'/businesses/{business_id}/finance/summary?days=30', headers=headers)
        assert finance.status_code == 200
        assert finance.json()['revenue_cents'] == 4000
        assert finance.json()['variable_costs_cents'] == 660
        assert finance.json()['contribution_cents'] == 3340

        onboarding = client.get(f'/businesses/{business_id}/onboarding', headers=headers)
        assert onboarding.status_code == 200
        assert onboarding.json()['setup_complete'] is True
        assert onboarding.json()['progress_percent'] == 100
        assert onboarding.json()['next_step'] is None


def test_quick_order_includes_channel_costs():
    with TestClient(app) as client:
        response = client.post('/auth/signup', json={
            'email': 'simplicity-channel@example.com',
            'password': 'senha-super-segura-123',
            'full_name': 'Channel Owner',
        })
        headers = {'Authorization': f"Bearer {response.json()['access_token']}"}
        business_id = client.post('/businesses', headers=headers, json={'name': 'Canal V11'}).json()['id']
        ingredient_id = client.post(f'/businesses/{business_id}/ingredients', headers=headers, json={
            'name': 'Base', 'unit': 'g', 'price_cents': 1000,
            'purchase_qty_milliunits': 1000, 'usable_qty_milliunits': 1000,
        }).json()['id']
        product_id = client.post(f'/businesses/{business_id}/products', headers=headers, json={
            'name': 'Prato', 'category': 'prato', 'active': True, 'units_per_batch': 1,
            'packaging_cents_per_unit': 100, 'energy_cents_per_batch': 0, 'labor_cents_per_batch': 0,
        }).json()['id']
        client.put(f'/businesses/{business_id}/products/{product_id}/recipe/{ingredient_id}', headers=headers, json={
            'ingredient_id': ingredient_id, 'qty_used_milliunits': 200,
        })
        channel = client.post(f'/businesses/{business_id}/channels', headers=headers, json={
            'name': 'Marketplace', 'fee_bps': 2000, 'fixed_fee_cents': 50,
            'delivery_cents': 100, 'promo_cents': 25, 'media_cents': 25,
        })
        assert channel.status_code == 201, channel.text
        channel_id = channel.json()['id']

        quick = client.post(f'/businesses/{business_id}/orders/quick', headers=headers, json={
            'product_id': product_id,
            'quantity': 1,
            'unit_price_cents': 2000,
            'channel_id': channel_id,
            'idempotency_key': 'channel-cost-v11',
        })
        assert quick.status_code == 201, quick.text
        body = quick.json()
        # Direct cost: R$2.00 ingredient + R$1.00 packaging = R$3.00.
        # Channel: 20% of R$20 + 0.50 + 1.00 + 0.25 + 0.25 = R$6.00.
        assert body['variable_cost_cents'] == 900
        assert body['contribution_cents'] == 1100
        assert body['channel']['total_channel_cost_cents'] == 600
