#!/usr/bin/env bash
# Markdown daily digest for nh1571/data-push-platform — for Qclaw / cron.
# Usage: ./scripts/repo-daily-digest.sh
set -euo pipefail

REPO="${REPO:-nh1571/data-push-platform}"
DATE="$(date '+%Y-%m-%d %H:%M %Z')"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh not logged in (run: gh auth login)" >&2
  exit 1
fi

echo "# 仓库日报 · ${REPO}"
echo ""
echo "- 时间：${DATE}"
echo "- 技能：data-push-maintainer"
echo "- 仓库：https://github.com/${REPO}"
echo ""

echo "## 开放 Issues"
echo ""
if ! gh issue list --repo "$REPO" --state open --limit 30 --json number,title,labels,updatedAt \
  --jq '.[] | "- #\(.number) \(.title) · \([.labels[].name] | join(", ")) · \(.updatedAt[:10])"' \
  2>/dev/null | grep -q .
then
  echo "无开放 Issue。"
else
  gh issue list --repo "$REPO" --state open --limit 30 --json number,title,labels,updatedAt \
    --jq '.[] | "- #\(.number) \(.title) · \([.labels[].name] | join(", ")) · \(.updatedAt[:10])"'
fi
echo ""

echo "## 开放 Pull Requests"
echo ""
if ! gh pr list --repo "$REPO" --state open --limit 20 --json number,title,author,isDraft,url \
  --jq '.[] | "- #\(.number)\(if .isDraft then " [draft]" else "" end) \(.title) · @\(.author.login) · \(.url)"' \
  2>/dev/null | grep -q .
then
  echo "无开放 PR。"
else
  gh pr list --repo "$REPO" --state open --limit 20 --json number,title,author,isDraft,url \
    --jq '.[] | "- #\(.number)\(if .isDraft then " [draft]" else "" end) \(.title) · @\(.author.login) · \(.url)"'
fi
echo ""

echo "## Maintainer 建议"
echo ""
echo "1. 无标签 Issue → 补 lane:* / type:* / priority:*"
echo "2. 非 draft 且可合并的 PR → 检查后: gh pr merge <n> --repo ${REPO} --squash --delete-branch"
echo "3. 有冲突/缺说明 → 评论要求修改，不要强行合"
echo "4. 将本日报发给 Owner"
echo ""
