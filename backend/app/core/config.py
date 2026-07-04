"""
Exovision Configuration
=======================
Centralized settings loaded from environment variables (with sensible defaults
for local development). Uses pydantic-settings for type-safe env parsing.

In production, these are set via Cloud Run environment variables or a .env file.
"""

from pathlib import Path
from typing import Union
from pydantic import field_validator
from pydantic_settings import BaseSettings


# Project root is two levels up from this file: backend/app/core/config.py → backend/ → exovision/
_PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application-wide configuration. All values can be overridden via env vars."""

    # ---- Paths ----
    # Absolute paths to data directories (relative to project root by default)
    data_raw_dir: Path = _PROJECT_ROOT / "data" / "raw"
    data_processed_dir: Path = _PROJECT_ROOT / "data" / "processed"
    data_catalog_dir: Path = _PROJECT_ROOT / "data" / "catalog"
    model_dir: Path = _PROJECT_ROOT / "models" / "saved"

    # ---- API ----
    # Origins allowed to make cross-origin requests (comma-separated in env)
    cors_origins: Union[list[str], str] = [
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # Alternate dev port
        "http://127.0.0.1:5173",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            # Try parsing as JSON list first
            if v.strip().startswith("[") and v.strip().endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            # Fallback to comma-separated values
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    # ---- Model ----
    # Name of the saved model file to load for inference
    model_filename: str = "exovision_cnn.pt"

    # ---- Misc ----
    debug: bool = True

    class Config:
        env_file = ".env"
        case_sensitive = False


# Singleton instance — import this everywhere
settings = Settings()
