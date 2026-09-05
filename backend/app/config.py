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

    # Public URL used to build account verification/recovery links.
    public_app_url: str = "http://localhost:5173"

    # Transactional email is provider-agnostic. Any SMTP provider can be used.
    # In non-production environments, disabled mode returns debug tokens so the
    # security flow is testable without buying an email service.
    email_delivery_mode: str = "disabled"  # disabled | smtp
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_starttls: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

    @property
    def email_delivery_configured(self) -> bool:
        return self.email_delivery_mode.lower() == "smtp" and bool(self.smtp_host and self.smtp_from_email)

    @model_validator(mode="after")
    def validate_settings(self):
        mode = self.email_delivery_mode.lower().strip()
        if mode not in {"disabled", "smtp"}:
            raise ValueError("EMAIL_DELIVERY_MODE deve ser disabled ou smtp")
        if mode == "smtp" and (not self.smtp_host or not self.smtp_from_email):
            raise ValueError("SMTP_HOST e SMTP_FROM_EMAIL são obrigatórios quando EMAIL_DELIVERY_MODE=smtp")

        if self.environment.lower() == "production":
            if self.secret_key == "dev-only-change-me" or len(self.secret_key) < 48:
                raise ValueError("SECRET_KEY de produção deve ser aleatória e ter pelo menos 48 caracteres")
            if self.database_url.startswith("sqlite"):
                raise ValueError("Produção deve usar PostgreSQL")
            if not self.cors_list or any(origin == "*" for origin in self.cors_list):
                raise ValueError("CORS_ORIGINS de produção deve listar origens explícitas")
            if not self.public_app_url.startswith("https://"):
                raise ValueError("PUBLIC_APP_URL de produção deve usar HTTPS")
        return self


settings = Settings()
