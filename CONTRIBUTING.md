# 贡献指南

感谢关注 [data-push-platform](https://github.com/nh1571/data-push-platform)！

## 5 分钟跑起来

```bash
git clone https://github.com/nh1571/data-push-platform.git
cd data-push-platform
./scripts/dev.sh
```

- 管理台：http://localhost:5173  
- 默认账号：`admin` / `admin123`  
- 不需要 Docker / MySQL / Redis（本地 SQLite）

详见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 怎么参与

1. **Fork** 本仓库 → 克隆你的 Fork  
2. 从 `main` 开分支，例如 `feature/studio-xxx`  
3. 小步提交，保持 `./scripts/dev.sh` 可跑  
4. 向 **本仓库 `main`** 提 Pull Request  

分工与分支（必读）：

- [docs/COLLAB_MODULES.md](docs/COLLAB_MODULES.md) — 三人改哪些目录  
- [docs/COLLAB_GIT.md](docs/COLLAB_GIT.md) — **从 main 开短分支、怎么提交/PR**  
- [docs/product/](docs/product/) — 产品与架构笔记

| 方向 | 标签 | 大致目录 |
|------|------|----------|
| 工作台 + 成图 | `lane:studio` | `frontend/src/pages/editor/`、`backend/app/modules/studio/` |
| 数据源 + 通道 | `lane:io` | `backend/app/plugins/` |
| 执行 + 调度 + 运营页 | `lane:runtime` | `execution/`、`scheduler/`、`pages/push-jobs` 等 |

Issue 标签：`good first issue`、`help wanted`、`type:feat` / `type:fix` / `type:docs`。

## 请注意

- **不要**提交密钥、`.env`、`backend/data/`、真实钉钉凭证  
- 大改公共文件（`pipeline.py`、`compile.py`、`EditorPage.tsx`）请先开 Issue 讨论  
- PR 说明里写清：改了什么、怎么验证  

## 行为准则

善意沟通；默认假设对方善意。严重不当行为维护者可关闭 PR / Issue。
