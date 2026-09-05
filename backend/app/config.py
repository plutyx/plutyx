from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "Cozinha 360 OS"
    environment: str = "development"
    database_url: str = "sqlite:///./cozinha360.db"
    secret_key: str = "dev-only-change-me"
    access_token_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

settings = Settings()
