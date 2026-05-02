# pyright: reportMissingImports=false
"""Run the backend with seeded forecast frames for HFT-13 QA.

Seeds the in-memory `DryRunForecastRepository` with fixture-backed GFS frames so
the public alert UI can render real frame data through `GET /api/forecast/frames`.

Run from the repo root with the backend on the path::

    PYTHONPATH=backend uv --project backend run python qa/run_seed_backend.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

_BACKEND_PATH = Path(__file__).resolve().parent.parent / "backend"
if _BACKEND_PATH.is_dir() and str(_BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(_BACKEND_PATH))

from app.ingestion.forecast_cli import run_dry_ingestion  # noqa: E402
from app.ingestion.models import ForecastProvider  # noqa: E402
from app.ingestion.repository import DryRunForecastRepository  # noqa: E402
from app.main import create_app  # noqa: E402


def main() -> None:
    repo = DryRunForecastRepository()
    asyncio.run(
        run_dry_ingestion(
            providers=[ForecastProvider.GFS],
            forecast_hours=[6, 12, 24, 48],
            include_mongo_preview=False,
            repository=repo,
            use_fixtures=True,
        )
    )

    import uvicorn

    app = create_app(forecast_repository=repo)
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
