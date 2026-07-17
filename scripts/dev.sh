#!/usr/bin/env bash
# Zero-deps local stack: SQLite meta DB + sync API + Vite frontend.
# Usage (from repo root):  ./scripts/dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="${BACKEND}/.venv"

export APP_ENV="${APP_ENV:-local}"
export EXECUTION_SYNC="${EXECUTION_SYNC:-true}"
export AUTO_MIGRATE="${AUTO_MIGRATE:-true}"
export SEED_DEMO_DATA="${SEED_DEMO_DATA:-true}"
# Prefer project-local data dirs
export PYTHONPATH="${BACKEND}${PYTHONPATH:+:$PYTHONPATH}"

echo "==> Repo: $ROOT"
echo "==> APP_ENV=$APP_ENV (local = SQLite, no MySQL/Redis required)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Need python3 (>=3.11)" >&2
  exit 1
fi

if [[ ! -d "$VENV" ]]; then
  echo "==> Creating venv"
  python3 -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"
python -m pip install -q -U pip
echo "==> Installing backend (editable)"
pip install -q -e "$BACKEND"

mkdir -p "$BACKEND/data" "$BACKEND/storage"

API_PID=""
cleanup() {
  if [[ -n "${API_PID}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    echo "==> Stopping API (pid $API_PID)"
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Starting API on :8000"
(
  cd "$BACKEND"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
) &
API_PID=$!

# Wait for health
for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    echo "==> API ready"
    curl -s "http://127.0.0.1:8000/health?detail=true" || true
    echo
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "API process exited early" >&2
    exit 1
  fi
  sleep 0.5
done

if command -v npm >/dev/null 2>&1; then
  echo "==> Frontend deps"
  (cd "$FRONTEND" && npm install --silent)
  echo "==> Frontend http://localhost:5173  (admin / admin123)"
  echo "==> API docs     http://localhost:8000/docs"
  cd "$FRONTEND"
  exec npm run dev -- --host 0.0.0.0 --port 5173
else
  echo "npm not found — API only at http://localhost:8000/docs"
  wait "$API_PID"
fi
