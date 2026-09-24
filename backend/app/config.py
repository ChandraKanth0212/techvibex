import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "RailOpt Module 1 — Data & Integration Hub"
    API_PREFIX: str = "/api"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # PostgreSQL Connection
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "railopt")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "railopt_secret_pass")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "railopt_db")

    # Optional Override DB URL
    CUSTOM_DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL", None)

    @property
    def DATABASE_URL(self) -> str:
        if self.CUSTOM_DATABASE_URL:
            return self.CUSTOM_DATABASE_URL
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def SYNC_DATABASE_URL(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"


settings = Settings()
