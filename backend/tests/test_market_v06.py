import uuid

from fastapi.testclient import TestClient

from app.main import app


def signup(client: TestClient, name: str):
    email = f"{name.lower()}-{uuid.uuid4().hex[:8]}@example.com"
    response = client.post("/auth/signup", json={
        "email": email,
        "password": "senha-super-segura-123",
        "full_name": name,
    })
    assert response.status_code == 201, response.text
    return email, {"Authorization": f"Bearer {response.json()['access_token']}"}, response.json()["user"]


def test_owner_production_finance_customer_journey():
    with TestClient(app) as client:
        owner_email, owner, _ = signup(client, "Owner")
        production_email, production, production_user = signup(client, "Producao")
        finance_email, finance, finance_user = signup(client, "Financeiro")

        created = client.post("/businesses", headers=owner, json={"name": "Cozinha Mercado", "city": "Mogi das Cruzes"})
        assert created.status_code == 201, created.text
        business_id = created.json()["id"]

        for email in (production_email, finance_email):
            added = client.post(f"/businesses/{business_id}/members", headers=owner, json={"email": email, "role": "member"})
            assert added.status_code == 201, added.text

        prod_prefs = client.put(f"/businesses/{business_id}/workspace/preferences", headers=production, json={
            "hidden_modules": ["financeiro", "clientes"],
            "module_order": ["hoje", "pedidos", "producao", "produtos", "custos", "financeiro", "clientes", "equipe", "config"],
            "home_focus": "production",
            "home_widgets": ["decision", "open_orders", "production", "demand", "inventory_alerts"],
            "compact_mode": True,
            "role_view": "operations",
            "default_product_id": None,
            "theme": "dark",
        })
        assert prod_prefs.status_code == 200, prod_prefs.text

        fin_prefs = client.put(f"/businesses/{business_id}/workspace/preferences", headers=finance, json={
            "hidden_modules": ["producao", "clientes"],
            "module_order": ["hoje", "financeiro", "custos", "produtos", "pedidos", "producao", "clientes", "equipe", "config"],
            "home_focus": "margin",
            "home_widgets": ["contribution", "sales", "losses", "inventory_alerts"],
            "compact_mode": False,
            "role_view": "finance",
            "default_product_id": None,
            "theme": "light",
        })
        assert fin_prefs.status_code == 200, fin_prefs.text

        prod_workspace = client.get(f"/businesses/{business_id}/workspace", headers=production)
        assert prod_workspace.status_code == 200
        assert prod_workspace.json()["member"]["user_id"] == production_user["id"]
        assert prod_workspace.json()["preferences"]["role_view"] == "operations"
        assert "financeiro" not in prod_workspace.json()["modules"]
        assert "equipe" not in prod_workspace.json()["modules"]

        fin_workspace = client.get(f"/businesses/{business_id}/workspace", headers=finance)
        assert fin_workspace.status_code == 200
        assert fin_workspace.json()["member"]["user_id"] == finance_user["id"]
        assert fin_workspace.json()["preferences"]["theme"] == "light"
        assert "financeiro" in fin_workspace.json()["modules"]
        assert "producao" not in fin_workspace.json()["modules"]

        ingredient = client.post(f"/businesses/{business_id}/ingredients", headers=owner, json={
            "name": "Carne moida",
            "unit": "g",
            "price_cents": 4000,
            "purchase_qty_milliunits": 1000,
            "usable_qty_milliunits": 900,
        })
        assert ingredient.status_code == 201, ingredient.text
        ingredient_id = ingredient.json()["id"]

        stock = client.patch(f"/businesses/{business_id}/ingredients/{ingredient_id}/inventory", headers=owner, json={
            "on_hand_milliunits": 5000,
            "par_level_milliunits": 5800,
            "reorder_target_milliunits": 9000,
            "expected_version": 1,
        })
        assert stock.status_code == 200, stock.text
        assert stock.json()["version"] == 2

        purchase = client.post(f"/businesses/{business_id}/purchases", headers=owner, json={
            "ingredient_id": ingredient_id,
            "quantity_milliunits": 1000,
            "total_cents": 4200,
            "freight_cents": 0,
            "tax_cents": 0,
            "idempotency_key": f"purchase-{uuid.uuid4().hex}",
        })
        assert purchase.status_code == 201, purchase.text
        assert purchase.json()["on_hand_milliunits"] == 6000

        product = client.post(f"/businesses/{business_id}/products", headers=owner, json={
            "name": "Smash da Casa",
            "category": "Burger",
            "active": True,
            "units_per_batch": 10,
            "packaging_cents_per_unit": 150,
            "energy_cents_per_batch": 500,
            "labor_cents_per_batch": 1000,
        })
        assert product.status_code == 201, product.text
        product_id = product.json()["id"]

        recipe = client.put(f"/businesses/{business_id}/products/{product_id}/recipe/{ingredient_id}", headers=owner, json={
            "ingredient_id": ingredient_id,
            "qty_used_milliunits": 200,
        })
        assert recipe.status_code == 200, recipe.text
        recipe_view = client.get(f"/businesses/{business_id}/products/{product_id}/recipe", headers=production)
        assert recipe_view.status_code == 200
        assert recipe_view.json()["items"][0]["qty_used_milliunits"] == 200

        order = client.post(f"/businesses/{business_id}/orders", headers=production, json={
            "total_cents": 5000,
            "variable_cost_cents": 2100,
            "source": "instagram",
            "paid": True,
            "idempotency_key": f"order-{uuid.uuid4().hex}",
        })
        assert order.status_code == 201, order.text
        order_id = order.json()["id"]

        item = client.post(f"/businesses/{business_id}/orders/{order_id}/items", headers=production, json={
            "product_id": product_id,
            "quantity": 2,
            "unit_price_cents": 2500,
            "unit_variable_cost_cents": 1050,
        })
        assert item.status_code == 201, item.text

        kds = client.get(f"/businesses/{business_id}/kds", headers=production)
        assert kds.status_code == 200
        assert kds.json()["count"] == 1
        assert kds.json()["orders"][0]["items"][0]["name"] == "Smash da Casa"

        completed = client.patch(f"/businesses/{business_id}/orders/{order_id}/status", headers=production, json={
            "status": "completed",
            "expected_version": 1,
        })
        assert completed.status_code == 200, completed.text
        assert completed.json()["inventory"]["consumed"] is True

        ingredients = client.get(f"/businesses/{business_id}/ingredients", headers=production).json()
        assert ingredients[0]["on_hand_milliunits"] == 5600

        completed_again = client.patch(f"/businesses/{business_id}/orders/{order_id}/status", headers=production, json={
            "status": "completed",
            "expected_version": 2,
        })
        assert completed_again.status_code == 200, completed_again.text
        assert completed_again.json()["inventory"]["replay"] is True
        ingredients_again = client.get(f"/businesses/{business_id}/ingredients", headers=production).json()
        assert ingredients_again[0]["on_hand_milliunits"] == 5600

        alerts = client.get(f"/businesses/{business_id}/inventory/alerts", headers=production)
        assert alerts.status_code == 200
        assert alerts.json()[0]["suggested_purchase_milliunits"] == 3400

        demand = client.get(f"/businesses/{business_id}/demand?horizon_days=1", headers=production)
        assert demand.status_code == 200
        forecast = demand.json()["products"][0]
        assert forecast["historical_units_28d"] == 2
        assert forecast["confidence"] == "low"
        assert forecast["method"] == "weighted_moving_average_7_21"

        batch = client.post(f"/businesses/{business_id}/production", headers=production, json={
            "product_id": product_id,
            "planned_qty": max(1, forecast["recommended_units"]),
            "responsible_user_id": production_user["id"],
            "notes": "Produzir de acordo com demanda e pedidos confirmados",
        })
        assert batch.status_code == 201, batch.text
        batch_id = batch.json()["id"]
        updated_batch = client.patch(f"/businesses/{business_id}/production/{batch_id}", headers=production, json={
            "status": "completed",
            "produced_qty": 2,
            "waste_qty": 0,
            "expected_version": 1,
        })
        assert updated_batch.status_code == 200, updated_batch.text
        assert updated_batch.json()["version"] == 2

        finance_summary = client.get(f"/businesses/{business_id}/finance/summary?days=30", headers=finance)
        assert finance_summary.status_code == 200
        assert finance_summary.json()["revenue_cents"] == 5000
        assert finance_summary.json()["contribution_cents"] == 2900
        assert finance_summary.json()["purchases_landed_cents"] == 4200

        members = client.get(f"/businesses/{business_id}/members", headers=owner)
        assert members.status_code == 200
        assert len(members.json()) == 3

        outsider_email, outsider, _ = signup(client, "Outsider")
        assert outsider_email
        outsider_business = client.post("/businesses", headers=outsider, json={"name": "Outro Negocio"})
        assert outsider_business.status_code == 201
        denied = client.get(f"/businesses/{business_id}/workspace", headers=outsider)
        assert denied.status_code == 403


def test_demand_with_no_sales_is_explicitly_low_confidence():
    with TestClient(app) as client:
        _, owner, _ = signup(client, "SemHistorico")
        business_id = client.post("/businesses", headers=owner, json={"name": "Cozinha Nova"}).json()["id"]
        product = client.post(f"/businesses/{business_id}/products", headers=owner, json={
            "name": "Wrap",
            "category": "Wraps",
            "active": True,
            "units_per_batch": 6,
            "packaging_cents_per_unit": 100,
            "energy_cents_per_batch": 200,
            "labor_cents_per_batch": 600,
        })
        assert product.status_code == 201
        demand = client.get(f"/businesses/{business_id}/demand?horizon_days=3", headers=owner)
        assert demand.status_code == 200
        row = demand.json()["products"][0]
        assert row["historical_units_28d"] == 0
        assert row["forecast_units"] == 0
        assert row["confidence"] == "low"
