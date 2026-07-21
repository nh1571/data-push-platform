#!/usr/bin/env bash
# 服务器日常更新脚本
# 用法：./scripts/server-update.sh
# 在 /opt/data-push-platform 下执行，由 dpush 账户调用
#
# 前置：前端构建产物（frontend/dist/）已在本地构建并提交到 Git。
# 服务器只需要 Python（conda）+ Git，无需 Node。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Git pull..."
git pull origin main

echo "==> Backend deps..."
cd "$ROOT/backend"
source /opt/anaconda3/etc/profile.d/conda.sh
conda activate dpush
pip install -e . -q

echo "==> Restart API..."
sudo systemctl restart data-push-api

echo "==> Done!"
echo "==> http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):8000"
