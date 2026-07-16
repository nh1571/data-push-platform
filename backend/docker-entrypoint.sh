#!/bin/sh
set -e

# Run DB migrations when starting the API (or when RUN_MIGRATIONS=1).
# Scheduler/worker skip this by default to avoid concurrent alembic races.
if [ "${RUN_MIGRATIONS:-0}" = "1" ] || [ "$1" = "uvicorn" ]; then
  echo "Running alembic upgrade head..."
  alembic upgrade head
fi

exec "$@"
