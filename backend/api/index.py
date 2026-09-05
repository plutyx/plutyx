from fastapi import FastAPI
from app.main import app as core_app

app = FastAPI(title="Cozinha 360 API Gateway")
app.mount("/api", core_app)
