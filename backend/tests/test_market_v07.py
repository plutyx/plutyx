import uuid

from fastapi.testclient import TestClient

from app.main import app


def signup(client: TestClient, prefix: str):
    email = f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"
    password = "senha-super-segura-123"
    response = client.post("/auth/signup", json={"email": email, "password": password, "full_name": prefix})
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    return email, password, {"Authorization": f"Bearer {token}"}


def test_shareable_invite_without_paid_email_and_tenant_permissions():
    with TestClient(app) as client:
        _, _, owner = signup(client, "ownerinvite")
        _, _, member = signup(client, "memberinvite")
        _, _, second_member = signup(client, "secondmember")
        _, _, outsider = signup(client, "outsiderinvite")
        business_id = client.post("/businesses", headers=owner, json={"name": "Cozinha Convite"}).json()["id"]

        denied = client.post(f"/businesses/{business_id}/invites", headers=outsider, json={"role": "member"})
        assert denied.status_code == 403

        created = client.post(f"/businesses/{business_id}/invites", headers=owner, json={
            "role": "member", "expires_hours": 24, "max_uses": 1
        })
        assert created.status_code == 201, created.text
        code = created.json()["code"]
        assert created.json()["share_path"].endswith(code)

        accepted = client.post(f"/invites/{code}/accept", headers=member)
        assert accepted.status_code == 201, accepted.text
        assert accepted.json()["business_id"] == business_id
        assert accepted.json()["role"] == "member"

        exhausted = client.post(f"/invites/{code}/accept", headers=second_member)
        assert exhausted.status_code == 410

        workspace = client.get(f"/businesses/{business_id}/workspace", headers=member)
        assert workspace.status_code == 200
        assert workspace.json()["member"]["role"] == "member"


def test_logout_all_revokes_old_token_and_password_change_issues_fresh_session():
    with TestClient(app) as client:
        email, password, headers = signup(client, "sessions")
        assert client.get("/me", headers=headers).status_code == 200

        revoked = client.post("/auth/logout-all", headers=headers)
        assert revoked.status_code == 200, revoked.text
        assert client.get("/me", headers=headers).status_code == 401

        login = client.post("/auth/login", json={"email": email, "password": password})
        assert login.status_code == 200, login.text
        fresh = {"Authorization": f"Bearer {login.json()['access_token']}"}
        changed = client.post("/auth/change-password", headers=fresh, json={
            "current_password": password,
            "new_password": "nova-senha-segura-456",
        })
        assert changed.status_code == 200, changed.text
        newer = {"Authorization": f"Bearer {changed.json()['access_token']}"}
        assert client.get("/me", headers=fresh).status_code == 401
        assert client.get("/me", headers=newer).status_code == 200
        old_password = client.post("/auth/login", json={"email": email, "password": password})
        assert old_password.status_code == 401
        new_password = client.post("/auth/login", json={"email": email, "password": "nova-senha-segura-456"})
        assert new_password.status_code == 200


def test_login_backoff_locks_repeated_wrong_passwords():
    with TestClient(app) as client:
        email, _, _ = signup(client, "lockout")
        for _ in range(5):
            response = client.post("/auth/login", json={"email": email, "password": "senha-incorreta-999"})
            assert response.status_code == 401
        locked = client.post("/auth/login", json={"email": email, "password": "senha-incorreta-999"})
        assert locked.status_code == 429
        assert "Tente novamente" in locked.json()["detail"]


def test_recipe_stock_drives_catalog_availability_for_free():
    with TestClient(app) as client:
        _, _, owner = signup(client, "availability")
        business_id = client.post("/businesses", headers=owner, json={"name": "Cozinha Estoque"}).json()["id"]
        ingredient = client.post(f"/businesses/{business_id}/ingredients", headers=owner, json={
            "name": "Frango", "unit": "g", "price_cents": 3000,
            "purchase_qty_milliunits": 1000, "usable_qty_milliunits": 1000,
        }).json()
        configured = client.patch(f"/businesses/{business_id}/ingredients/{ingredient['id']}/inventory", headers=owner, json={
            "on_hand_milliunits": 300,
            "par_level_milliunits": 200,
            "reorder_target_milliunits": 1000,
            "expected_version": 1,
        })
        assert configured.status_code == 200
        product = client.post(f"/businesses/{business_id}/products", headers=owner, json={
            "name": "Wrap de Frango", "category": "Wrap", "active": True,
            "units_per_batch": 5, "packaging_cents_per_unit": 100,
            "energy_cents_per_batch": 100, "labor_cents_per_batch": 500,
        }).json()
        recipe = client.put(f"/businesses/{business_id}/products/{product['id']}/recipe/{ingredient['id']}", headers=owner, json={
            "ingredient_id": ingredient["id"], "qty_used_milliunits": 200
        })
        assert recipe.status_code == 200

        availability = client.get(f"/businesses/{business_id}/catalog/availability", headers=owner)
        assert availability.status_code == 200
        row = availability.json()["products"][0]
        assert row["max_units"] == 1
        assert row["status"] == "low"
        assert row["limiting_ingredient"] == "Frango"

        zero = client.patch(f"/businesses/{business_id}/ingredients/{ingredient['id']}/inventory", headers=owner, json={
            "on_hand_milliunits": 0,
            "par_level_milliunits": 200,
            "reorder_target_milliunits": 1000,
            "expected_version": configured.json()["version"],
        })
        assert zero.status_code == 200
        sold_out = client.get(f"/businesses/{business_id}/catalog/availability", headers=owner).json()["products"][0]
        assert sold_out["max_units"] == 0
        assert sold_out["status"] == "sold_out"
