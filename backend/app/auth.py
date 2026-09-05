from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Annotated
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db

ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str: return ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try: return ph.verify(hashed, password)
    except VerifyMismatchError: return False


def create_token(user_id: int, email: str, auth_version: int = 1) -> str:
    now = datetime.now(timezone.utc)
    payload={
        "sub":str(user_id),"email":email,"ver":auth_version,
        "iat":int(now.timestamp()),"exp":int((now+timedelta(minutes=settings.access_token_minutes)).timestamp()),"iss":"cozinha360"
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    try: return jwt.decode(token, settings.secret_key, algorithms=["HS256"], issuer="cozinha360")
    except jwt.PyJWTError as exc: raise HTTPException(status_code=401, detail="Sessão inválida") from exc


async def current_user(credentials: Annotated[HTTPAuthorizationCredentials|None,Depends(bearer)], db: Annotated[Session,Depends(get_db)]):
    if not credentials: raise HTTPException(status_code=401, detail="Autenticação necessária")
    from .models import User
    payload=decode_token(credentials.credentials)
    user=db.get(User,int(payload["sub"]))
    if not user or not user.is_active: raise HTTPException(status_code=401, detail="Usuário inativo ou inexistente")
    if int(payload.get("ver",0)) != user.auth_version: raise HTTPException(status_code=401, detail="Sessão revogada")
    return user
