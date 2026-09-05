from fastapi.testclient import TestClient

import app.account_security as account_security
from app.account_security import AuthActionToken, _token_hash
from app.config import settings
from app.db import SessionLocal
from app.main import app


def signup(client, email='recovery-owner@example.com'):
    response = client.post('/auth/signup', json={
        'email': email,
        'password': 'senha-inicial-segura-123',
        'full_name': 'Recovery Owner',
    })
    assert response.status_code == 201, response.text
    token = response.json()['access_token']
    return {'Authorization': f'Bearer {token}'}


def test_email_verification_and_password_recovery_are_one_time_and_hashed(monkeypatch):
    captured = {}

    def capture_delivery(user, purpose, raw):
        captured[purpose] = raw
        return {'delivery': 'test-capture'}

    monkeypatch.setattr(account_security, '_deliver_or_debug', capture_delivery)

    with TestClient(app) as client:
        headers = signup(client)

        status = client.get('/auth/security-status', headers=headers)
        assert status.status_code == 200, status.text
        assert status.json()['email_verified'] is False
        assert status.json()['transactional_email_configured'] is settings.email_delivery_configured

        verification = client.post('/auth/email-verification/request', headers=headers)
        assert verification.status_code == 200, verification.text
        assert verification.json()['delivery'] == 'test-capture'
        assert 'debug_token' not in verification.json()
        verify_token = captured['verify_email']

        with SessionLocal() as db:
            row = db.query(AuthActionToken).filter(AuthActionToken.purpose == 'verify_email').order_by(AuthActionToken.id.desc()).first()
            assert row is not None
            assert row.token_hash == _token_hash(verify_token)
            assert row.token_hash != verify_token

        verified = client.post('/auth/email-verification/confirm', json={'token': verify_token})
        assert verified.status_code == 200, verified.text
        assert verified.json()['email_verified'] is True

        replay_verification = client.post('/auth/email-verification/confirm', json={'token': verify_token})
        assert replay_verification.status_code == 410

        status = client.get('/auth/security-status', headers=headers)
        assert status.status_code == 200
        assert status.json()['email_verified'] is True
        assert status.json()['email_verified_at'] is not None

        unknown = client.post('/auth/password-reset/request', json={'email': 'nobody@example.com'})
        assert unknown.status_code == 200
        assert unknown.json()['ok'] is True
        assert 'debug_token' not in unknown.json()

        reset_request = client.post('/auth/password-reset/request', json={'email': 'recovery-owner@example.com'})
        assert reset_request.status_code == 200, reset_request.text
        reset_token = captured['password_reset']
        # Public reset responses remain generic even though the test transport captured the token internally.
        assert 'debug_token' not in reset_request.json()

        with SessionLocal() as db:
            row = db.query(AuthActionToken).filter(AuthActionToken.purpose == 'password_reset').order_by(AuthActionToken.id.desc()).first()
            assert row is not None
            assert row.token_hash == _token_hash(reset_token)
            assert row.token_hash != reset_token

        confirmed = client.post('/auth/password-reset/confirm', json={
            'token': reset_token,
            'new_password': 'senha-nova-super-segura-456',
        })
        assert confirmed.status_code == 200, confirmed.text
        assert confirmed.json()['sessions_revoked'] is True

        # Password reset increments auth_version, invalidating the previous session.
        old_session = client.get('/me', headers=headers)
        assert old_session.status_code == 401

        old_login = client.post('/auth/login', json={
            'email': 'recovery-owner@example.com',
            'password': 'senha-inicial-segura-123',
        })
        assert old_login.status_code == 401

        new_login = client.post('/auth/login', json={
            'email': 'recovery-owner@example.com',
            'password': 'senha-nova-super-segura-456',
        })
        assert new_login.status_code == 200, new_login.text

        replay_reset = client.post('/auth/password-reset/confirm', json={
            'token': reset_token,
            'new_password': 'outra-senha-super-segura-789',
        })
        assert replay_reset.status_code == 410


def test_delivery_never_exposes_debug_tokens_in_production_without_smtp():
    if settings.environment.lower() != 'production' or settings.email_delivery_configured:
        return

    with TestClient(app) as client:
        headers = signup(client, 'production-delivery@example.com')
        verification = client.post('/auth/email-verification/request', headers=headers)
        assert verification.status_code == 200, verification.text
        assert verification.json()['delivery'] == 'unavailable'
        assert 'debug_token' not in verification.json()
        assert 'debug_link' not in verification.json()

        reset_request = client.post('/auth/password-reset/request', json={'email': 'production-delivery@example.com'})
        assert reset_request.status_code == 200, reset_request.text
        assert 'debug_token' not in reset_request.json()
        assert 'debug_link' not in reset_request.json()
