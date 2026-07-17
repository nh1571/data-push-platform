# 仓库全权维护者（Maintainer）说明

> 目标：有人（或 Agent）能**代理 Owner** 做日常仓库事务：看 Issue、审/合 PR、维护文档与标签，让你不必每件事亲自动手。

**仓库：** https://github.com/nh1571/data-push-platform  
**Owner：** nh1571（最高权限仍在你）

---

## 1. 两种「全权代理」

| 类型 | 是谁 | 怎么授权 |
|------|------|----------|
| **人类 Maintainer** | 同事 A | 网页 Invite → 角色 **Admin** 或 **Maintain** |
| **Agent Maintainer** | 本机已 `gh auth login` 的编码助手 | 你书面约定「全权维护」+ 本技能；用你的 Token 操作 |

两者可以同时存在（人 + Agent）。

---

## 2. Maintainer 日常职责（代办清单）

| 频率 | 事项 |
|------|------|
| **每天** | `gh issue list` / `gh pr list`；回复/贴标签；可合的 PR 合并 |
| **有 PR 时** | 看 diff、要求补测试/说明；通过则 **squash merge** 进 `main` |
| **有 Issue 时** | 分类 `lane:*` / `type:*` / `priority:*`；指派或写清接受标准 |
| **每周** | 扫 stale PR/Issue；更新 `docs/DEVELOPMENT_HANDOFF.md` §7 若有大进展 |
| **随时** | 拒绝危险提交（密钥、force main、破坏性迁移未说明） |

### 默认合并策略

- base：**`main`**
- 方式：**squash merge** + 删功能分支  
- 合并前至少：能说明改了什么、无密钥、不明显破坏 `./scripts/dev.sh`

### Agent 默认可做 / 仍须高风险确认

| 默认可做（你已授权「全权维护」后） | 仍须你口头确认 |
|-----------------------------------|----------------|
| 列/建/关/评论 Issue | 改仓库可见性（公/私） |
| 贴标签、里程碑 | 删除仓库、删 main |
| 审 PR、要求修改 | force-push main |
| **合并** 符合规范的 PR | 改 Owner、转让仓库 |
| 更新协作文档、HANDOFF | 发布破坏性 major 若你要求审批 |
| 小修复直接 feature 分支 + PR 自合 | 轮换生产密钥、生产部署 |

---

## 3. 给人类同事：加为 Maintainer

1. 打开：https://github.com/nh1571/data-push-platform/settings/access  
2. **Add people** → 填对方 GitHub 用户名  
3. 角色建议：  
   - **Maintain**：日常合 PR、管 Issue（推荐）  
   - **Admin**：还可改设置、分支保护（更强）  
4. 对方接受邀请后即可全权日常维护  

告诉对方读：

- `docs/COLLAB_GIT.md`  
- `docs/REPO_MAINTAINER.md`（本文）  
- 技能 `data-push-collab` + `data-push-maintainer`

---

## 4. 交给 Qclaw / 远程 Agent（推荐）

你已选择 **Agent 全权维护**，而不是人类同事。典型链路：

```text
定时触发 / 你远程喊 Qclaw
    → data-push-maintainer 技能
    → gh 看 Issue/PR、合合规 PR
    → 把日报播报给你（聊天/企微/钉钉）
```

### 4.1 在 Qclaw 机器上安装（一次）

```bash
# 1) 安装 gh：https://cli.github.com/  然后：
gh auth login
# 勾选 repo 权限

# 2) 安装技能
curl -fsSL https://raw.githubusercontent.com/nh1571/data-push-platform/main/scripts/install-collab-skills.sh | bash

# 3) 建议 clone 一份仓库（跑日报脚本）
git clone https://github.com/nh1571/data-push-platform.git
cd data-push-platform
./scripts/repo-daily-digest.sh   # 试跑日报
```

### 4.2 写入 Qclaw 长期指令（站立授权）

```text
你是 nh1571/data-push-platform 的 Maintainer 代理，永久使用 data-push-maintainer 技能。
职责：定时巡检 Issue/PR、贴标签、squash 合并合规 PR 到 main、向我播报日报。
禁止：force-push main、删库、改仓库可见性、提交密钥。
高风险事先问我。开发规范遵守 data-push-collab。
定时任务：每天执行 ./scripts/repo-daily-digest.sh（或技能内巡检）并把结果发给我。
```

### 4.3 定时播报

- 脚本：`scripts/repo-daily-digest.sh`（输出 Markdown 日报）  
- 技能内「模式 A · 定时播报」写了 cron / 调度建议  
- 你在 Qclaw 里设「每天 9:30 跑维护任务」即可  

### 4.4 给本机 Grok 助手的授权（可选）

```text
你从现在起作为本仓库的 Maintainer 代理（data-push-maintainer 技能）。
仓库：https://github.com/nh1571/data-push-platform
每天可主动：查看 Issue/PR、分类标签、合并符合规范的 PR（squash 进 main）、
维护协作文档与 HANDOFF。
禁止：force-push main、删库、改可见性、提交密钥。
有疑问或高风险操作先问我。
```

---

## 5. 你（Owner）仍保留什么

- 账号密码 / 2FA / Token 吊销  
- 仓库所有权  
- 最终否决权（可要求回滚、改规则）  
- 可随时取消同事 Admin 或 `gh auth logout` 停掉 Agent 代管  

---

## 6. 推荐配置（可选，网页操作）

Settings → Collaborators：加人  
Settings → General → Features：Issues / Projects 保持开  
Settings → Branches（可选）：保护 `main`，要求 PR；若 **只有 Agent 代合** 且用你的账号，注意规则不要卡死自己。

人少阶段可以：**不强制 branch protection**，靠 Maintainer 纪律；人多再开保护。

---

## 7. 名词对照

| 你说的 | 标准名 |
|--------|--------|
| 全权代理管仓库的人 | **Maintainer（维护者）** |
| 提代码申请 | **Pull Request (PR)** |
| 点同意合进去 | **Merge** |
| 建仓库的人 | **Owner** |
