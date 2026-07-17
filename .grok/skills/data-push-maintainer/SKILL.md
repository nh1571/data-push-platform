---
name: data-push-maintainer
description: >
  Full repository maintainer proxy for data-push-platform / nh1571/data-push-platform:
  triage issues, review and merge PRs, labels, handoff, daily repo health,
  仓库维护, 合并PR, 全权代理, maintainer, 每天看issue, /data-push-maintainer.
  Use when user authorizes agent to manage the GitHub repo on their behalf.
---

# Data Push Platform · 仓库维护者代理（Maintainer）

当用户授权你为 **Maintainer 代理** 时启用本技能。  
书面说明：`docs/REPO_MAINTAINER.md`。  
协同开发仍遵守：`data-push-collab`。

**仓库：** https://github.com/nh1571/data-push-platform  
**默认分支：** `main`

---

## 0. 授权门闩

仅在用户明确说过类似下面意思后，才进入「全权日常代管」模式：

- 「全权代理维护仓库」  
- 「你来管 PR 和 Issue」  
- 「用 data-push-maintainer」  

**未授权时：** 只建议、列状态；**不合并 PR、不关他人 Issue**。

---

## 1. 每日巡检（可主动做）

```bash
cd /path/to/data-push-platform   # 或 gh 不依赖 cwd
gh auth status
gh issue list --repo nh1571/data-push-platform --state open --limit 20
gh pr list --repo nh1571/data-push-platform --state open --limit 20
```

对用户简报：

```text
Issue 开放 N 个：…
PR 开放 M 个：…（建议合 / 需改 / 冲突）
已操作：…
需你拍板：…
```

---

## 2. Issue 处理

- 贴标签：`lane:studio|io|runtime`、`type:feat|fix|docs`、`priority:P0|P1|P2`、`help wanted`  
- 评论：复现步骤、接受标准、指向 `docs/COLLAB_GIT.md`  
- 重复 Issue → 关并 `duplicate`  
- 问询类 → `question`  
- **不删**有讨论价值的 Issue；可 close 并说明原因  

```bash
gh issue edit <n> --repo nh1571/data-push-platform --add-label "lane:studio,priority:P1"
gh issue comment <n> --repo nh1571/data-push-platform --body "…"
gh issue close <n> --repo nh1571/data-push-platform --reason completed
```

---

## 3. PR 审查与合并（核心）

### 3.1 查看

```bash
gh pr list --repo nh1571/data-push-platform
gh pr view <n> --repo nh1571/data-push-platform
gh pr diff <n> --repo nh1571/data-push-platform
gh pr checks <n> --repo nh1571/data-push-platform 2>/dev/null || true
```

### 3.2 合并前检查单

```text
[ ] base 是 main
[ ] 无 .env / 密钥 / backend/data 大文件
[ ] 标题/说明能看懂
[ ] 不明显破坏本地启动路径（scripts/dev.sh / APP_ENV=local）
[ ] 跨 lane 大改是否合理
[ ] 无 force、无重写 main 历史
```

本地可抽查（有 clone 时）：

```bash
git fetch origin
gh pr checkout <n>
# 可选：pytest / npm run build
```

### 3.3 合并（默认）

```bash
gh pr merge <n> --repo nh1571/data-push-platform --squash --delete-branch
```

需修改时：

```bash
gh pr comment <n> --repo nh1571/data-push-platform --body "请补充：…"
gh pr request-changes  # 若 CLI 支持；否则 comment 说明
```

明显有害的 PR：comment 说明 + close，或要求重开。

---

## 4. 维护性小修

小文档/标签/破损链接：

1. 从 `main` 开 `chore/maint-…` 或 `docs/…`  
2. commit → push → PR → **自己 squash 合**（授权后）  

遵守 `data-push-collab` 的分支命名。

---

## 5. 绝对禁止（即使全权）

| 禁止 | 原因 |
|------|------|
| `git push --force` 到 `main` | 毁历史 |
| 删除仓库 / 改 Private↔Public | Owner 决策 |
| 提交或回传密钥 | 安全 |
| 转让 Owner | Owner 决策 |
| 无说明的破坏性 DB 迁移合入 | 需显式确认 |

---

## 6. 与 collab 技能分工

| 技能 | 角色 |
|------|------|
| **data-push-collab** | 开发者：怎么拉、建分支、推、开 PR |
| **data-push-maintainer** | 维护者：怎么审、合、管 Issue |
| **continue-data-push-dev** | 本机启停环境、HANDOFF 收工 |

---

## 7. 对用户的固定回复格式（日报可选）

```text
【仓库日报】yyyy-mm-dd
- 新/未处理 Issue：
- 待合 PR：
- 今日已合并：
- 风险/需你确认：
```
