# 数据推送中台 / data-push-platform

Data push middleware platform for configuring sources, transformations, and delivery channels.

## Prerequisites

- Python 3.11+
- Docker & Docker Compose (for Postgres / Redis)

## Quick start

```bash
# Start infrastructure
docker compose up -d

# Install backend (editable + dev deps)
cd backend
pip install -e ".[dev]"

# Run health check test
pytest tests/test_health.py -v
```

## Health endpoint

With the API running (`uvicorn app.main:app --reload` from `backend/`):

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

## Configuration

Copy `.env.example` to `.env` and adjust values as needed.
