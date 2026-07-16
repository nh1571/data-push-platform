# Backend image for API / scheduler / Celery worker
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps for psycopg / pillow (if needed at runtime)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

RUN pip install --upgrade pip \
    && pip install .

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Persistent local artifact storage (images / file exports)
RUN mkdir -p /app/storage
VOLUME ["/app/storage"]

EXPOSE 8000

ENTRYPOINT ["/docker-entrypoint.sh"]
# Default command: API server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
