from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "Cozinha 360 OS"
    environment: str = "development"
    database_url: str = "sqlite:///./cozinha360.db"
    secret_key: str = "dev-only-change-me"
    access_token_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    trust_proxy_headers: bool = True
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

    @model_validator(mode="after")
    def validate_production(self):
        if self.environment.lower() == "production":
            if self.secret_key == "dev-only-change-me" or len(self.secret_key) < 48:
                raise ValueError("SECRET_KEY de produção deve ser aleatória e ter pelo menos 48 caracteres")
            if self.database_url.startswith("sqlite"):
                raise ValueError("Produção deve usar PostgreSQL")
            if not self.cors_list or any(origin == "*" for origin in self.cors_list):
                raise ValueError("CORS_ORIGINS de produção deve listar origens explícitas")
        return self

settings = Settings()
