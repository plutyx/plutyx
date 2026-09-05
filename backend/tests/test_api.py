from fastapi.testclient import TestClient
from app.main import app


def auth(client,email,name):
    r=client.post('/auth/signup',json={'email':email,'password':'senha-super-segura-123','full_name':name})
    assert r.status_code==201, r.text
    return {'Authorization':f"Bearer {r.json()['access_token']}"}


def test_real_user_journey_and_tenant_isolation():
    with TestClient(app) as client:
        alice=auth(client,'alice@cozinha360.test','Alice')
        r=client.post('/businesses',headers=alice,json={'name':'Cozinha da Alice','city':'Mogi das Cruzes'})
        assert r.status_code==201, r.text
        business_id=r.json()['id']

        r=client.post(f'/businesses/{business_id}/ingredients',headers=alice,json={
            'name':'Carne','unit':'g','price_cents':3990,'purchase_qty_milliunits':1000,'usable_qty_milliunits':900
        })
        assert r.status_code==201, r.text

        r=client.post(f'/businesses/{business_id}/products',headers=alice,json={
            'name':'Smash Bacon','units_per_batch':10,'packaging_cents_per_unit':150,'energy_cents_per_batch':500,'labor_cents_per_batch':1000
        })
        assert r.status_code==201, r.text

        r=client.post(f'/businesses/{business_id}/channels',headers=alice,json={
            'name':'WhatsApp','fee_bps':300,'fixed_fee_cents':0,'delivery_cents':800,'promo_cents':0,'media_cents':300,'traffic_active':True
        })
        assert r.status_code==201, r.text
        channel_id=r.json()['id']

        r=client.post(f'/businesses/{business_id}/price-engine',headers=alice,json={
            'product_id':1,'channel_id':channel_id,'sale_price_cents':3490,'direct_cost_cents':1200,'desired_contribution_cents':1000
        })
        assert r.status_code==200, r.text
        assert r.json()['minimum_price_cents']>0

        idem='pedido-teste-001'
        payload={'channel_id':channel_id,'total_cents':3490,'variable_cost_cents':2300,'source':'instagram','paid':True,'idempotency_key':idem}
        first=client.post(f'/businesses/{business_id}/orders',headers=alice,json=payload)
        replay=client.post(f'/businesses/{business_id}/orders',headers=alice,json=payload)
        assert first.status_code==201 and replay.status_code==201
        assert replay.json()['idempotent_replay'] is True
        assert first.json()['id']==replay.json()['id']

        dashboard=client.get(f'/businesses/{business_id}/dashboard',headers=alice)
        assert dashboard.status_code==200
        assert dashboard.json()['pulse']['revenue_cents']==3490

        bob=auth(client,'bob@cozinha360.test','Bob')
        denied=client.get(f'/businesses/{business_id}/ingredients',headers=bob)
        assert denied.status_code==403


def test_capacity_guard_behaves_like_operation_gate():
    with TestClient(app) as client:
        headers=auth(client,'capacity@cozinha360.test','Capacidade')
        b=client.post('/businesses',headers=headers,json={'name':'Cozinha Capacidade'}).json()['id']
        r=client.post(f'/businesses/{b}/capacity',headers=headers,json={'steps':[[6,2],[4,1],[5,1]],'safety_margin_bps':2500,'open_orders':7})
        assert r.status_code==200
        assert r.json()=={'technical_per_hour':12,'safe_per_hour':9,'signal':'yellow'}
