#!/usr/bin/env bash
# Print a Markdown daily digest for nh1571/data-push-platform (Issues + PRs).
# For Qclaw / cron / scheduled agents: run this script and send stdout to the user.
#
# Usage:
#   ./scripts/repo-daily-digest.sh
#   REPO=nh1571/data-push-platform ./scripts/repo-daily-digest.sh
#
# Requires: gh auth login (repo scope)
set -euo pipefail

REPO="${REPO:-nh1571/data-push-platform}"
DATE="$(date '+%Y-%m-%d %H:%M %Z')"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found. Install: https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh not logged in. Run: gh auth login" >&2
  exit 1
fi

echo "# 仓库日报 · ${REPO}"
echo ""
echo "- 时间：${DATE}"
echo "- 维护技能：data-push-maintainer"
echo ""

echo "## 开放 Issues"
echo ""
ISSUE_JSON="$(gh issue list --repo "$REPO" --state open --limit 30 --json number,title,labels,updatedAt,author 2>/dev/null || echo '[]')"
ISSUE_N="$(echo "$ISSUE_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)"
echo "共 **${ISSUE_N}** 个开放 Issue。"
echo ""
if [[ "${ISSUE_N}" != "0" ]]; then
  echo "$ISSUE_JSON" | python3 -c '
import sys, json
items = json.load(sys.stdin)
for i in items:
    labs = ",".join(l["name"] for l in i.get("labels") or []) or "-"
    print(f"- #{i[\"number\"]} {i[\"title\"]}  \n  labels: `{labs}` · @{i[\"author\"][\"login\"]} · updated {i[\"updatedAt\"][:10]}")
' 2>/dev/null || gh issue list --repo "$REPO" --state open --limit 30
fi
echo ""

echo "## 开放 Pull Requests"
echo ""
PR_JSON="$(gh pr list --repo "$REPO" --state open --limit 20 --json number,title,author,isDraft,mergeable,updatedAt,url 2>/dev/null || echo '[]')"
PR_N="$(echo "$PR_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)"
echo "共 **${PR_N}** 个开放 PR。"
echo ""
if [[ "${PR_N}" != "0" ]]; then
  echo "$PR_JSON" | python3 -c '
import sys, json
items = json.load(sys.stdin)
for p in items:
    draft = " [draft]" if p.get("isDraft") else ""
    m = p.get("mergeable") or "?"
    print(f"- #{p[\"number\"]}{draft} {p[\"title\"]}  \n  @{p[\"author\"][\"login\"]} · mergeable={m} · {p[\"url\"]}")
' 2>/dev/null || gh pr list --repo "$REPO" --state open --limit 20
fi
echo ""

echo "## 建议动作（给 Maintainer Agent）"
echo ""
echo "1. 给无标签 Issue 补 \`lane:*\` / \`type:*\` / \`priority:*\`"
echo "2. 对 mergeable=MERGEABLE 且非 draft 的 PR：按 data-push-maintainer 检查后 squash 合并"
echo "3. 有冲突/缺说明的 PR：评论要求作者处理"
echo "4. 向 Owner 播报本摘要（企业微信/钉钉/聊天均可）"
echo ""
echo "---"
echo "一键合并示例（仅合规 PR）：\`gh pr merge <n> --repo ${REPO} --squash --delete-branch\`"
