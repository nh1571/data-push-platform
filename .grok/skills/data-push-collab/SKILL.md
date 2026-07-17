---
name: data-push-collab
description: >
  Collaborative development rules for data-push-platform / 数据推送中台:
  multi-agent or multi-developer git workflow, branch naming, PR, commits,
  module ownership (studio/io/runtime), 协同开发, 分支规范, 怎么提交, 开 PR,
  /data-push-collab, or any agent about to push/branch/PR in this repo.
---

# Data Push Platform · 协同开发技能（强制）

任何 Agent 在本仓库做**多人/多 Agent 并行开发、开分支、提交、推送、PR** 前，必须按本技能执行。

完整书面规范：`docs/COLLAB_GIT.md`、`docs/COLLAB_MODULES.md`。  
产品背景：`docs/product/`（原 Obsidian 笔记，已入库）。  
工程交接：`docs/DEVELOPMENT_HANDOFF.md`。

---

## 0. 硬规则（违反即停）

1. **主集成分支是 `main`**，不是 `feature/m0-scaffold`。  
2. **分工 ≠ 永久分支**。甲/乙/丙对应**目录**，任务用**短生命周期** `feature/<lane>-*` 分支。  
3. **禁止** force-push `main`。  
4. **禁止**提交密钥、`.env`、`backend/data/`、真实通道凭证。  
5. 大功能**不要**直接堆在 `main` 上开发（hotfix 除外）。  
6. 未读 `docs/DEVELOPMENT_HANDOFF.md` §7 与本技能前，不发明新架构。  
7. 用户未明确说「推送/合并」时：可本地 commit；**push/merge PR 先说明**。

---

## 1. 三人模块（改哪里）

| Lane | 谁 | 主目录 | 分支前缀 |
|------|-----|--------|----------|
| **studio** | 甲 | `frontend/src/pages/editor/*`、`backend/app/modules/studio/*`、`api/v1/editor.py` | `feature/studio-*` |
| **io** | 乙 | `backend/app/plugins/datasource/*`、`channel/*`、对应 pages | `feature/io-*` |
| **runtime** | 丙 | `execution/*`、`scheduler/*`、`worker/*`、push-jobs/job-runs 页 | `feature/runtime-*` |

总线（改前同步）：`pipeline.py`、`compile.py`、`plugins/base.py`、`frontend/src/api/types.ts`、`EditorPage.tsx`。

**工作台 + 成图同属 studio**，不要拆给两个长期 Owner。

---

## 2. 分支怎么开（标准流程）

```bash
cd /Users/hello/grok/data-push-platform   # 或 clone 路径
git fetch origin
git checkout main
git pull origin main
git checkout -b feature/studio-<topic>    # 按 lane 换前缀
```

命名：

```text
feature/studio-<topic>
feature/io-<topic>
feature/runtime-<topic>
fix/<topic>
docs/<topic>
```

**不要**新建长期分支 `lane/studio` 并无限堆功能。

---

## 3. 怎么开发

1. 本地：`./scripts/dev.sh`（`APP_ENV=local`，SQLite，无需 Docker）。见 `docs/DEPLOYMENT.md`。  
2. 登录：`admin` / `admin123`。  
3. 只改本 lane 目录；跨 lane 先开 Issue 或用户确认。  
4. 产品疑问先查 `docs/product/`（尤其 02/03/09/13/17/22）。  
5. 验证：相关 `pytest`；前端 UI 改动 `npm run build`。

---

## 4. 怎么提交

```bash
git status
git add <files>          # 勿 git add . 若有 data/密钥
git commit -m "feat(studio): 简短完整句说明"
```

Message 前缀：`feat|fix|docs|chore|refactor` + 可选 scope `(studio|io|runtime|deploy)`。

---

## 5. 怎么推送与 PR

```bash
git push -u origin HEAD
gh pr create --base main --title "feat(studio): …" --body "## 摘要\n## 如何验证\n## 关联 Issue"
```

- PR **base 必须是 `main`**。  
- 标题与 commit 风格一致。  
- 合并策略优先 **squash**（历史干净）；合并后删除功能分支。  
- 标签：`lane:studio|io|runtime`，`type:feat|fix|docs`。

合并（需用户意图）：

```bash
gh pr merge <n> --squash --delete-branch
git checkout main && git pull origin main
```

---

## 6. 并行与同步

每个工作日或每个 PR 前：

```bash
git fetch origin
git merge origin/main     # 在自己的 feature 分支上
# 或: git rebase origin/main  （仅自己的未共享分支）
```

冲突：优先保留双方意图；模块 Owner 目录以 Owner 为准。

---

## 7. Agent 会话启动检查单

```text
[ ] 读 docs/DEVELOPMENT_HANDOFF.md §7
[ ] 读 docs/COLLAB_GIT.md（或本技能）
[ ] git status / branch / 是否脏工作区
[ ] 确认任务属于 studio | io | runtime
[ ] 从最新 main 开 feature/<lane>-*
[ ] 需要服务时 ./scripts/dev.sh 或已有进程
[ ] 不 invent 与 docs/product 冲突的架构
```

---

## 8. 与 continue-data-push-dev 的关系

| 技能 | 何时 |
|------|------|
| **continue-data-push-dev** | 启动/收工、起停环境、写 HANDOFF |
| **data-push-collab**（本技能） | 分支/提交/PR/多人并行/协同规范 |

两者都适用时：先 collab 定分支，再 continue 起环境，再写代码。

---

## 9. 公开仓库

- URL: https://github.com/nh1571/data-push-platform  
- 外部贡献：Fork + PR（见根目录 `CONTRIBUTING.md`）  
- 代管：`docs/GITHUB_OPS.md`

---

## Red flags

| 行为 | 纠正 |
|------|------|
| 在 main 上直接做大功能 | cherry-pick/挪到 feature 分支 |
| 使用永久 `lane/*` 分支不合并 | 拆 PR 合入 main |
| force push main | 禁止；需用户书面确认的灾难恢复除外 |
| 提交 .env / data/*.db | 立刻从提交中剔除并轮换密钥 |
| 无视 docs/product 重设计 | 停工，对齐笔记与 HANDOFF |
