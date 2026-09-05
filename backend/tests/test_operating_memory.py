from fastapi.testclient import TestClient

from app.main import app


def auth(client: TestClient, email: str, name: str) -> dict[str, str]:
    response = client.post(
        "/auth/signup",
        json={"email": email, "password": "senha-super-segura-123", "full_name": name},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_operating_memory_is_versioned_and_tenant_scoped():
    with TestClient(app) as client:
        owner = auth(client, "memory-owner@example.com", "Memory Owner")
        business = client.post(
            "/businesses",
            headers=owner,
            json={"name": "Cozinha Memory", "city": "Mogi das Cruzes"},
        )
        assert business.status_code == 201, business.text
        business_id = business.json()["id"]

        empty = client.get(f"/businesses/{business_id}/memory/system360", headers=owner)
        assert empty.status_code == 200
        assert empty.json()["version"] == 0
        assert empty.json()["data"] == {}

        first = client.put(
            f"/businesses/{business_id}/memory/system360",
            headers=owner,
            json={"data": {"cpa": {"capacity": "20", "max": "7", "loss": "90"}}, "expected_version": 0},
        )
        assert first.status_code == 200, first.text
        assert first.json()["version"] == 1
        assert first.json()["data"]["cpa"]["max"] == "7"

        stale = client.put(
            f"/businesses/{business_id}/memory/system360",
            headers=owner,
            json={"data": {"cpa": {"max": "9"}}, "expected_version": 0},
        )
        assert stale.status_code == 409
        assert stale.json()["detail"]["current_version"] == 1

        second = client.put(
            f"/businesses/{business_id}/memory/system360",
            headers=owner,
            json={"data": {"cpa": {"capacity": "24", "max": "8", "loss": "110"}}, "expected_version": 1},
        )
        assert second.status_code == 200, second.text
        assert second.json()["version"] == 2

        listing = client.get(f"/businesses/{business_id}/memory", headers=owner)
        assert listing.status_code == 200
        assert listing.json()["states"]["system360"]["version"] == 2

        history = client.get(f"/businesses/{business_id}/memory/system360/history", headers=owner)
        assert history.status_code == 200
        assert [row["version"] for row in history.json()["revisions"]] == [2, 1]
        assert history.json()["revisions"][0]["data"]["cpa"]["capacity"] == "24"

        invalid = client.put(
            f"/businesses/{business_id}/memory/not-a-real-module",
            headers=owner,
            json={"data": {"x": 1}},
        )
        assert invalid.status_code == 422

        outsider = auth(client, "memory-outsider@example.com", "Outsider")
        denied = client.get(f"/businesses/{business_id}/memory", headers=outsider)
        assert denied.status_code == 403
        denied_write = client.put(
            f"/businesses/{business_id}/memory/growth",
            headers=outsider,
            json={"data": {"metrics": {"clicks": 10}}},
        )
        assert denied_write.status_code == 403


def test_operating_memory_rejects_oversized_state():
    with TestClient(app) as client:
        owner = auth(client, "memory-size@example.com", "Memory Size")
        business_id = client.post(
            "/businesses",
            headers=owner,
            json={"name": "Cozinha Size"},
        ).json()["id"]
        oversized = client.put(
            f"/businesses/{business_id}/memory/vitrine",
            headers=owner,
            json={"data": {"content": "x" * (100 * 1024)}},
        )
        assert oversized.status_code == 413
