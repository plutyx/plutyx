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


def test_readiness_checks_current_schema():
    with TestClient(app) as client:
        live = client.get('/livez')
        assert live.status_code == 200
        assert live.json()['release'] == '0.9.0'

        ready = client.get('/readyz')
        assert ready.status_code == 200, ready.text
        assert ready.json()['schema'] == 'current'
        assert ready.json()['database'] == 'reachable'


def test_data_quality_exposes_bad_inputs_before_more_automation():
    with TestClient(app) as client:
        owner = auth(client, 'quality-owner@example.com', 'Quality Owner')
        business = client.post('/businesses', headers=owner, json={'name': 'Cozinha Quality'}).json()['id']

        ingredient = client.post(f'/businesses/{business}/ingredients', headers=owner, json={
            'name': 'Ingrediente sem mínimo', 'unit': 'g', 'price_cents': 1000,
            'purchase_qty_milliunits': 1000, 'usable_qty_milliunits': 1000,
        })
        assert ingredient.status_code == 201

        product = client.post(f'/businesses/{business}/products', headers=owner, json={
            'name': 'Produto sem ficha', 'category': 'teste', 'active': True,
            'units_per_batch': 1, 'packaging_cents_per_unit': 0,
            'energy_cents_per_batch': 0, 'labor_cents_per_batch': 0,
        })
        assert product.status_code == 201

        order = client.post(f'/businesses/{business}/orders', headers=owner, json={
            'total_cents': 2000, 'variable_cost_cents': 1000,
            'source': 'manual', 'paid': True, 'idempotency_key': 'quality-no-items',
        })
        assert order.status_code == 201

        quality = client.get(f'/businesses/{business}/data-quality', headers=owner)
        assert quality.status_code == 200, quality.text
        body = quality.json()
        codes = {row['code'] for row in body['issues']}
        assert 'inventory_par_missing' in codes
        assert 'product_recipe_missing' in codes
        assert 'paid_order_without_items' in codes
        assert body['status'] == 'critical'
        assert body['score'] < 60

        audit = client.get(f'/businesses/{business}/audit?limit=20', headers=owner)
        assert audit.status_code == 200, audit.text
        assert len(audit.json()) >= 3

        outsider = auth(client, 'quality-outsider@example.com', 'Quality Outsider')
        denied_quality = client.get(f'/businesses/{business}/data-quality', headers=outsider)
        assert denied_quality.status_code == 403
        denied_audit = client.get(f'/businesses/{business}/audit', headers=outsider)
        assert denied_audit.status_code == 403
