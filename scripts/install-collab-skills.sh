#!/usr/bin/env bash
# Install data-push collaboration skills for Grok / local agents.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/nh1571/data-push-platform/main/scripts/install-collab-skills.sh | bash
#   # or inside a clone:
#   ./scripts/install-collab-skills.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/nh1571/data-push-platform.git}"
BRANCH="${BRANCH:-main}"
TMP="${TMPDIR:-/tmp}/data-push-collab-skills-$$"

cleanup() { rm -rf "$TMP" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> Installing data-push collab skills (branch=$BRANCH)"

if [[ -f "$(dirname "$0")/../.grok/skills/data-push-collab/SKILL.md" ]]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  echo "==> Using local repo: $ROOT"
else
  echo "==> Cloning $REPO_URL ($BRANCH)…"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP/repo"
  ROOT="$TMP/repo"
fi

install_one() {
  local name="$1"
  local src="$ROOT/.grok/skills/$name/SKILL.md"
  if [[ ! -f "$src" ]]; then
    echo "WARN: missing $src" >&2
    return 1
  fi
  for base in "$HOME/.grok/skills" "$HOME/.agents/skills"; do
    mkdir -p "$base/$name"
    cp "$src" "$base/$name/SKILL.md"
    echo "    installed → $base/$name/SKILL.md"
  done
}

install_one "data-push-collab"
install_one "continue-data-push-dev" || true

echo ""
echo "==> Done. Tell your coding agent, for example:"
echo ""
echo "  用 data-push-collab 技能。"
echo "  仓库：https://github.com/nh1571/data-push-platform"
echo "  从 main 拉最新，按 skill 建 feature/<lane>-* 分支。"
echo "  任务：<在这里写要开发什么>"
echo "  做完 push 并开 PR 到 main。"
echo ""
echo "Skills: data-push-collab (协同) · continue-data-push-dev (启停环境)"
