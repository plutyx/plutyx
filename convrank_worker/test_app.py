import pytest
from fastapi import HTTPException
from convrank_worker.app import blocked_ip, canonicalize, validate_public_url


def test_blocks_private_and_loopback_ips():
    assert blocked_ip("127.0.0.1")
    assert blocked_ip("10.0.0.1")
    assert blocked_ip("192.168.1.1")
    assert not blocked_ip("1.1.1.1")


def test_canonicalize_rejects_non_http():
    with pytest.raises(HTTPException):
        canonicalize("file:///etc/passwd")


def test_canonicalize_normalizes_host_and_fragment():
    assert canonicalize("HTTPS://Example.COM/path#x") == "https://example.com/path"


@pytest.mark.asyncio
async def test_validate_rejects_localhost():
    with pytest.raises(HTTPException):
        await validate_public_url("http://127.0.0.1/")
