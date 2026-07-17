# 贡献指南

感谢关注 [data-push-platform](https://github.com/nh1571/data-push-platform)！

## 给同事 / Agent：一键安装协同技能

```bash
curl -fsSL https://raw.githubusercontent.com/nh1571/data-push-platform/main/scripts/install-collab-skills.sh | bash
```

或已 clone 仓库时：

```bash
./scripts/install-collab-skills.sh
```

装好后对 Agent 说（只改「任务」一行即可）：

```text
用 data-push-collab 技能。
仓库：https://github.com/nh1571/data-push-platform
从 main 拉最新，按 skill 建 feature/<lane>-* 分支。
任务：<写要开发什么，如 studio：画布网格吸附>
做完 push 并开 PR 到 main。
```

**完整命令（拉代码 / 建分支 / 推送 / PR）见：**

- 给人读：[docs/COLLAB_GIT.md](docs/COLLAB_GIT.md)  
- 给 Agent：[`.grok/skills/data-push-collab/SKILL.md`](.grok/skills/data-push-collab/SKILL.md)

## 5 分钟跑起来

```bash
git clone https://github.com/nh1571/data-push-platform.git
cd data-push-platform
git checkout main
./scripts/dev.sh
```

- 管理台：http://localhost:5173 · 账号 `admin` / `admin123`  
- 不需要 Docker / MySQL / Redis  

## 开发与推送（最短）

```bash
git checkout main && git pull origin main
git checkout -b feature/studio-你的任务   # 或 feature/io-… / feature/runtime-…

# 改代码后
git add <文件>
git commit -m "feat(studio): 说明"
git push -u origin HEAD

# 开 PR：base 必须是 main（网页或 gh pr create --base main）
```

> 远程一开始可能只有 `main`——**正常**。任务分支由你自己创建并 push。

## 怎么参与

| 身份 | 做法 |
|------|------|
| 有仓库写权限 | clone 本仓 → 建 `feature/*` → push → PR → `main` |
| 外部 | **Fork** → clone 你的 Fork → 分支 → push Fork → PR 到本仓 `main` |

分工目录：[docs/COLLAB_MODULES.md](docs/COLLAB_MODULES.md)  
产品笔记：[docs/product/](docs/product/)

| 方向 | 分支前缀 | 标签 |
|------|----------|------|
| 工作台 + 成图 | `feature/studio-*` | `lane:studio` |
| 数据源 + 通道 | `feature/io-*` | `lane:io` |
| 执行 + 调度 + 运营 | `feature/runtime-*` | `lane:runtime` |

## 请注意

- 勿提交密钥、`.env`、`backend/data/`、真实钉钉凭证  
- 大改 `pipeline.py` / `compile.py` / `EditorPage.tsx` 先开 Issue  
- PR 写清改动与验证方式  
- 代码注释会被作为 PR review 的**评估维度之一**：关键 / 非显然逻辑建议写清 why、边界与坑（不足会被建议补，但不会因此单独打回）  

## 行为准则

善意沟通。严重不当行为维护者可关闭 PR / Issue。
