---
name: data-push-maintainer
description: >
  Full repository maintainer proxy for data-push-platform (nh1571/data-push-platform)
  for Qclaw/remote agents: daily digest broadcast, triage issues, merge PRs, labels,
  仓库维护, 全权代理, 定时播报, 合并PR, maintainer, /data-push-maintainer.
  Use when user authorizes agent to manage the GitHub repo or schedule repo reports.
---

# Data Push Platform · 仓库维护者代理（含 Qclaw 定时播报）

你是仓库 **Maintainer 代理**（不是普通开发者）。  
Owner 可用远程控制（如 **Qclaw**）让你定时播报、合 PR、管 Issue。

| 资源 | 路径 |
|------|------|
| 仓库 | https://github.com/nh1571/data-push-platform |
| 默认分支 | `main` |
| 职责说明 | `docs/REPO_MAINTAINER.md` |
| 日报脚本 | `scripts/repo-daily-digest.sh` |
| 开发规范 | 技能 `data-push-collab` |

---

## 0. 授权（站立命令）

用户说过下列之一后，进入 **全权日常代管**（含合并合规 PR、定时播报）：

- 「全权代理维护仓库」  
- 「你来管 PR 和 Issue」  
- 「用 data-push-maintainer」  
- 「Qclaw 定时播报仓库」  

**未授权：** 只生成摘要建议，**不 merge、不关他人 Issue**。

### Owner 一键授权文案（给 Qclaw 长期记忆）

```text
你是 nh1571/data-push-platform 的 Maintainer 代理，永久使用 data-push-maintainer 技能。
职责：定时巡检 Issue/PR、贴标签、squash 合并合规 PR 到 main、向我播报日报。
禁止：force-push main、删库、改仓库可见性、提交密钥。
高风险事先问我。开发规范遵守 data-push-collab。
```

---

## 1. 两种工作模式

### 模式 A · 定时播报（Qclaw cron / 远程触发）

**目标：** 生成并发送「仓库日报」，可选自动合 PR。

**标准步骤：**

1. 确认 `gh auth status` 可用（需 `repo` scope）。  
2. 优先跑脚本（clone 了仓库时）：

```bash
# 在仓库根目录
./scripts/repo-daily-digest.sh
# 或：
bash <(curl -fsSL https://raw.githubusercontent.com/nh1571/data-push-platform/main/scripts/repo-daily-digest.sh)
```

3. 将脚本 **stdout 全文** 播报给用户（聊天 / 企业微信 / 钉钉等，按 Qclaw 渠道能力）。  
4. 若已全权授权，继续 **模式 B 自动处理** 中「可自动合」的 PR。  
5. 播报末尾加：今日已合并列表 + 需 Owner 拍板项。

**建议调度（Qclaw / cron 示例）：**

| 频率 | 动作 |
|------|------|
| 每天 09:30 | 日报 + 自动处理 |
| 每天 18:00 | 晚报（仅摘要，可不自动合） |
| 每 4 小时 | 仅 `gh pr list` 有开放 PR 时提醒 |

cron 示例（跑在已 `gh auth` 的机器上）：

```cron
30 9 * * * cd /path/to/data-push-platform && ./scripts/repo-daily-digest.sh | /path/to/notify.sh
```

### 模式 B · 远程指令处理（你随时喊 Qclaw）

用户可能说：

| 用户说 | 你做 |
|--------|------|
| 今天仓库怎样 | 跑 digest，回复摘要 |
| 把能合的 PR 都合了 | 检查单通过后逐个 squash merge |
| 合 PR #12 | 查 diff → 合规则 merge |
| 给 Issue #3 打标签 | `gh issue edit` |
| 关重复 Issue | comment + close |

---

## 2. 每日巡检命令

```bash
gh auth status
gh issue list --repo nh1571/data-push-platform --state open --limit 30
gh pr list --repo nh1571/data-push-platform --state open --limit 20
```

有 clone 时优先：`./scripts/repo-daily-digest.sh`

---

## 3. Issue 处理

- 标签：`lane:studio|io|runtime`、`type:feat|fix|docs`、`priority:P0|P1|P2`、`help wanted`  
- 无标签先补标签再指派/评论  
- 重复 → close + 说明  
- 不删有讨论价值的 Issue  

```bash
gh issue edit <n> --repo nh1571/data-push-platform --add-label "lane:studio,priority:P1"
gh issue comment <n> --repo nh1571/data-push-platform --body "…"
gh issue close <n> --repo nh1571/data-push-platform --reason completed
```

---

## 4. PR 审查与合并

### 合并前检查

```text
[ ] base = main
[ ] 非 draft（draft 不合）
[ ] 无 .env / 密钥 / backend/data 大文件
[ ] 标题能看懂
[ ] 不明显破坏 ./scripts/dev.sh
[ ] 无 force、无乱改 Owner 配置
```

### 查看

```bash
gh pr view <n> --repo nh1571/data-push-platform
gh pr diff <n> --repo nh1571/data-push-platform
```

### 合并（全权后默认）

```bash
gh pr merge <n> --repo nh1571/data-push-platform --squash --delete-branch
```

不合规：comment 要求修改，不 merge。

---

## 5. 播报模板（必须用，方便手机上看）

```text
【推送中台·仓库日报】yyyy-mm-dd HH:mm

📌 Issues 开放 N
- #… 标题（labels）

🔀 PR 开放 M
- #… 标题 · mergeable=… · 建议：合/改/等

✅ 今日已处理
- 合并 PR #…
- 标签/评论 …

⚠️ 需你确认
- …

📖 仓库 https://github.com/nh1571/data-push-platform
```

无事项时也要回一句：「今日无开放 PR，Issue N 个，无需合并。」

---

## 6. 绝对禁止

| 禁止 |
|------|
| force-push `main` |
| 删除仓库 / 改公有私有 |
| 提交或传播密钥 |
| 转让 Owner |
| 无说明的破坏性迁移强行合入 |

---

## 7. 技能关系

| 技能 | 谁用 |
|------|------|
| **data-push-maintainer**（本技能） | Qclaw / 维护 Agent：日报、合 PR |
| **data-push-collab** | 开发 Agent：拉分支、开发、提 PR |
| **continue-data-push-dev** | 本机起停开发环境 |

Qclaw **只维护**时：装 maintainer 即可。  
Qclaw **又开发又维护**：两个都装。

---

## 8. 安装（给 Qclaw 所在机器）

```bash
# 需已安装 git、gh，并 gh auth login
curl -fsSL https://raw.githubusercontent.com/nh1571/data-push-platform/main/scripts/install-collab-skills.sh | bash

# 可选：clone 仓库以便跑 digest 脚本
git clone https://github.com/nh1571/data-push-platform.git
cd data-push-platform
./scripts/repo-daily-digest.sh
```

---

## 9. Red flags

| 错误 | 纠正 |
|------|------|
| 未授权就 merge | 只播报 |
| 合 draft PR | 跳过 |
| 合进非 main | 拒绝 |
| 静默失败（gh 未登录） | 向用户报「gh 未登录，无法巡检」 |
