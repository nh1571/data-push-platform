# Git 协同规范（三人 + 多 Agent）

> **结论先说：** 分工对应 **目录/模块**，不对应「每人永久一条长分支」。  
> 分支是 **短生命周期功能线**，从 `main` 拉出、做完合回 `main`。

---

## 1. 分支模型（采用：主干 + 短功能分支）

```text
main                          ← 唯一集成线；保持可 ./scripts/dev.sh
  │
  ├── feature/studio-画布缩放     ← 甲 的一条任务（做完就删）
  ├── feature/io-钉钉oto         ← 乙
  └── feature/runtime-补跑参数   ← 丙
```

| 分支 | 用途 | 寿命 |
|------|------|------|
| **`main`** | 默认可运行、可合并目标 | 长期 |
| **`feature/<lane>-<简述>`** | 单任务开发 | **几天内**合完并删除 |
| `feature/m0-scaffold` | 历史脚手架线 | 已并入 main，**勿再当主开发线** |
| `fix/...` / `docs/...` | 修 bug / 纯文档 | 短 |

### 为什么不「甲永远在 branch-studio」？

| 永久分工分支 | 问题 |
|--------------|------|
| `lane/studio` 长期不合并 | 与 main 差越来越大，合并爆炸 |
| 三人各改各的永远不合 | 无法一起跑完整产品 |
| Agent 不知从哪拉 | 混乱 |

**分工 = 你改哪些目录**（见 COLLAB_MODULES）。  
**分支 = 你这一次任务的隔离沙箱**（做完必须回到 main）。

---

## 2. 命名约定

```text
feature/studio-<topic>    # 甲 · 工作台+成图
feature/io-<topic>        # 乙 · 数据源+通道
feature/runtime-<topic>   # 丙 · 执行+调度+运营
fix/<topic>
docs/<topic>
chore/<topic>
```

示例：`feature/studio-push-shell`、`feature/io-webhook-retry`、`fix/runtime-jobrun-log`。

---

## 3. 标准开发流程（人 / Agent 相同）

```bash
# 0. 仓库
cd /path/to/data-push-platform
git fetch origin
git checkout main
git pull origin main

# 1. 开任务分支（按自己的 lane）
git checkout -b feature/studio-xxx

# 2. 本地跑通（默认零依赖）
./scripts/dev.sh
# 或仅 API：APP_ENV=local 见 docs/DEPLOYMENT.md

# 3. 开发 → 小步提交
git add <相关文件>
git commit -m "feat(studio): 简短说明"

# 4. 推远程
git push -u origin HEAD

# 5. 开 PR → base: main
gh pr create --base main --title "feat(studio): …" --body "…"

# 6. 合并后删分支
gh pr merge --squash   # 或网页 Merge
git checkout main && git pull
git branch -d feature/studio-xxx
```

### 提交信息

```text
feat(studio): …
fix(io): …
docs: …
chore: …
```

scope 建议：`studio` | `io` | `runtime` | `deploy` | 空。

---

## 4. 并行时如何少冲突

1. **认领目录**（COLLAB_MODULES 甲/乙/丙），少改别人目录。  
2. **一天至少一次** `git fetch && git merge origin/main`（或 rebase）到自己的 feature 分支。  
3. 总线文件（`pipeline.py`、`compile.py`、`EditorPage.tsx`、`types.ts`）改前 Issue 打招呼。  
4. PR 宜小：一个 PR 一个主题。

---

## 5. Agent 强制规则

1. 开始前：`git status` + `git branch` + 读 `docs/DEVELOPMENT_HANDOFF.md` §7。  
2. **禁止**直接在 `main` 上堆大功能（紧急 hotfix 除外，且尽快 PR 记录）。  
3. **禁止** `git push --force` 到 `main`。  
4. **禁止**提交 `.env`、密钥、`backend/data/*`、真实钉钉凭证。  
5. 推送 / 合并 PR：用户未授权则先说明再执行（用户说「直接推/合」可执行）。  
6. 收工：更新 HANDOFF §7；有意义改动必须 commit。  
7. 产品决策：优先 `docs/product/` 与 HANDOFF，**不要从零发明架构**。

---

## 6. 与 GitHub Issues

| 标签 | 含义 |
|------|------|
| `lane:studio` / `lane:io` / `lane:runtime` | 三条分工线 |
| `help wanted` / `good first issue` | 欢迎外部贡献 |
| `type:feat` / `fix` / `docs` | 类型 |

PR 建议关联：`Fixes #12` 或 body 里写 Issue 编号。

---

## 7. 一图记忆

```text
  分工（谁改哪）          分支（怎么隔离）
  ─────────────          ────────────────
  甲 studio 目录    →    feature/studio-*  → PR → main
  乙 io 插件目录    →    feature/io-*      → PR → main
  丙 runtime 目录   →    feature/runtime-* → PR → main
```
