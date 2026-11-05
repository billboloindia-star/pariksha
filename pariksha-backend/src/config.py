"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    jwt_secret: str
    gemini_api_key: str
    users_table: str = "pariksha-users-dev"
    attempts_table: str = "pariksha-attempts-dev"
    aws_region: str = "ap-south-1"
    stage: str = "dev"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
