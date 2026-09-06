from fastapi.testclient import TestClient

from app.main import app


def signup(client: TestClient, email: str):
    response = client.post('/auth/signup', json={
        'email': email,
        'password': 'senha-super-segura-123',
        'full_name': email.split('@')[0],
    })
    assert response.status_code == 201, response.text
    return {'Authorization': f"Bearer {response.json()['access_token']}"}


def product_with_cost(client: TestClient, headers: dict, business_id: int, suffix: str, ingredient_cost: int):
    ingredient = client.post(f'/businesses/{business_id}/ingredients', headers=headers, json={
        'name': f'Ingrediente {suffix}',
        'unit': 'g',
        'price_cents': ingredient_cost,
        'purchase_qty_milliunits': 1000,
        'usable_qty_milliunits': 1000,
    })
    assert ingredient.status_code == 201, ingredient.text
    ingredient_id = ingredient.json()['id']
    product = client.post(f'/businesses/{business_id}/products', headers=headers, json={
        'name': f'Produto {suffix}',
        'category': 'teste',
        'active': True,
        'units_per_batch': 1,
        'packaging_cents_per_unit': 0,
        'energy_cents_per_batch': 0,
        'labor_cents_per_batch': 0,
    })
    assert product.status_code == 201, product.text
    product_id = product.json()['id']
    recipe = client.put(
        f'/businesses/{business_id}/products/{product_id}/recipe/{ingredient_id}',
        headers=headers,
        json={'ingredient_id': ingredient_id, 'qty_used_milliunits': 1000},
    )
    assert recipe.status_code == 200, recipe.text
    return ingredient_id, product_id


def test_portfolio_orders_owned_businesses_by_operational_risk():
    with TestClient(app) as client:
        owner = signup(client, 'portfolio-owner-v50@example.com')
        risky = client.post('/businesses', headers=owner, json={'name': 'Unidade Risco', 'city': 'Mogi'}).json()
        stable = client.post('/businesses', headers=owner, json={'name': 'Unidade Estável', 'city': 'Suzano'}).json()

        risky_ingredient, risky_product = product_with_cost(client, owner, risky['id'], 'Risco', 1200)
        inventory = client.patch(
            f"/businesses/{risky['id']}/ingredients/{risky_ingredient}/inventory",
            headers=owner,
            json={
                'on_hand_milliunits': 0,
                'par_level_milliunits': 1000,
                'reorder_target_milliunits': 2000,
                'expected_version': 1,
            },
        )
        assert inventory.status_code == 200, inventory.text
        negative = client.post(f"/businesses/{risky['id']}/orders/quick", headers=owner, json={
            'product_id': risky_product,
            'quantity': 1,
            'unit_price_cents': 500,
            'paid': True,
            'source': 'balcao',
            'idempotency_key': 'portfolio-risk-v50',
        })
        assert negative.status_code == 201, negative.text
        assert negative.json()['contribution_cents'] < 0

        _, stable_product = product_with_cost(client, owner, stable['id'], 'Estavel', 300)
        positive = client.post(f"/businesses/{stable['id']}/orders/quick", headers=owner, json={
            'product_id': stable_product,
            'quantity': 2,
            'unit_price_cents': 1500,
            'paid': True,
            'source': 'whatsapp',
            'idempotency_key': 'portfolio-stable-v50',
        })
        assert positive.status_code == 201, positive.text
        assert positive.json()['contribution_cents'] > 0

        outsider = signup(client, 'portfolio-outsider-v50@example.com')
        hidden = client.post('/businesses', headers=outsider, json={'name': 'Operação de Outro Usuário'}).json()

        overview = client.get('/portfolio/overview', headers=owner)
        assert overview.status_code == 200, overview.text
        body = overview.json()
        assert body['period_days'] == 30
        assert body['summary']['businesses'] == 2
        assert body['businesses'][0]['business_id'] == risky['id']
        assert body['businesses'][0]['attention']['code'] == 'negative_contribution'
        assert body['businesses'][0]['attention']['score'] == 100
        assert body['businesses'][0]['stock_alerts'] == 1
        assert body['businesses'][1]['business_id'] == stable['id']
        assert body['businesses'][1]['attention']['code'] == 'stable'
        assert body['top_action']['business_id'] == risky['id']
        assert body['top_action']['href'] == f"/?today=1&business_id={risky['id']}"
        assert hidden['id'] not in [row['business_id'] for row in body['businesses']]
        assert body['summary']['contribution_cents'] == sum(row['contribution_cents'] for row in body['businesses'])
