# 分工线（Lane）注册表 · 可扩展

> **三条线只是起步默认值，不是天花板。**  
> 人变多、领域变大时：在本表**增加一行**即可，不必推翻 Git 模型。

**Git 规则不变：** 永远 `main` + 短分支 `feature/<laneId>-<topic>` → PR → main。  
**分工规则：** Lane = **目录职责** + **分支前缀** + **Issue 标签**；不是永久 Git 分支。

---

## 1. 当前注册的 Lane（默认 3 条）

| laneId | 中文名 | 典型职责 | 主目录（拥有） | 分支前缀 | Issue 标签 |
|--------|--------|----------|----------------|----------|------------|
| `studio` | 内容工作台+成图 | 模板编辑、画布、推送壳、compile 成图 | `frontend/src/pages/editor/*`、`backend/app/modules/studio/*`、`api/v1/editor.py` | `feature/studio-*` | `lane:studio` |
| `io` | 数据源+通道 | 取数插件、投递插件、配置页 | `plugins/datasource/*`、`plugins/channel/*`、`pages/data-sources/*`、`pages/channels/*` | `feature/io-*` | `lane:io` |
| `runtime` | 执行+调度+运营 | JobRun 管线、cron、任务/运行 UI | `modules/execution/*`、`scheduler/*`、`worker/*`、`pages/push-jobs/*`、`job-runs/*` | `feature/runtime-*` | `lane:runtime` |

| 人少时的挂靠（无专人也可） | laneId 建议 | 目录 |
|---------------------------|-------------|------|
| 登录/加密/Token | `platform`（见下，可选） | `identity/*`、`common/crypto.py`、`auth` |
| 部署/脚本/文档基建 | `platform` | `scripts/*`、`docs/*`（协作类）、`config.py` |

---

## 2. 什么时候加第 4、第 5 条线？

| 信号 | 建议 |
|------|------|
| 一条线里 **2+ 人常抢同一目录** | **拆线**或约定子目录 Owner |
| 出现稳定新领域（如「权限多租户」「多租户计费」「移动端」） | **新 laneId** |
| 只是人手多了，领域没变 | **多人共线**，不必硬拆 |
| 某线太大但一人做完 | **先别拆**，避免空壳 lane |

**原则：按「领域/目录」扩展，不要按「人头」一人一线硬凑。**

---

## 3. 加人，但不加线（更常见）

同一 lane 可以多人：

```text
studio
  ├─ 同学 A：画布 ComposeCanvas
  └─ 同学 B：组装推送文案壳
```

约定：

1. 子目录口头/Issue 认领，或在本表「备注」列写清  
2. 分支仍用 `feature/studio-*`，topic 写细：`feature/studio-compose-snap`  
3. 大改 `EditorPage.tsx` 仍要互相打招呼  

---

## 4. 加一条新 Lane 的标准动作（复制清单）

假设新增 **`observability`（可观测/日志大盘）**：

### 4.1 填注册表（改本文件）

在上表增加一行，例如：

| laneId | 中文名 | 职责 | 主目录 | 分支前缀 | 标签 |
|--------|--------|------|--------|----------|------|
| `observability` | 可观测 | 运行大盘、链路、告警配置 | `frontend/...`、`backend/...`（写实） | `feature/obs-*` | `lane:observability` |

### 4.2 GitHub 标签

```bash
gh label create "lane:observability" --description "可观测/日志大盘" --color "5319E7" --force
```

### 4.3 文档

- 更新本文件 + `COLLAB_MODULES.md` 链接到本表  
- 可选：产品笔记 `docs/product/` 补一页  

### 4.4 技能

- `data-push-collab` / `data-push-maintainer` 的 lane 列表改为「见 docs/LANES.md」，或同步加一行  

### 4.5 从哪天生效

- 新 PR 使用新前缀；旧 PR 不必改名  
- Maintainer 按新标签分类 Issue  

**不需要：** 新建永久远程分支 `lane/observability`。

---

## 5. 预留可选 Lane（未启用，想到再开）

| laneId | 可能职责 | 何时启用 |
|--------|----------|----------|
| `platform` | 登录、配置加密、部署脚本、本地 dev 体验 | 有人专职或平台改动变多 |
| `design-system` | 管理台统一组件/主题（非工作台画布） | 前端页面风格债变重 |
| `qa` | E2E、回归、测试数据 | 有专职测试/质量 |
| `docs` | 仅文档与对外说明 | 文档工作量大到占满一人 |
| `mobile` / `open-api` | 若产品长出新端 | 真有代码目录再注册 |

未启用前：**挂靠**到最接近的现有 lane（如部署 → runtime 或 platform）。

---

## 6. 与人数的对应关系（弹性）

| 人数 | 建议 |
|------|------|
| 1 | 一人全揽；仍用短分支，lane 当「改动分类」 |
| 2～3 | 用默认 3 线；可有人兼 platform |
| 4～6 | 3 线 **多人共线**，或拆出 platform / docs |
| 更多 | 按目录再拆 lane；每线设 **Owner + 备份** |

```text
人数 ↑  ≠  必须 lane 数 ↑
领域复杂度 ↑  →  才增加 lane
```

---

## 7. Owner 表（可改）

| laneId | Owner | 备份 | 备注 |
|--------|-------|------|------|
| studio | | | 当前主战场，宜专人 |
| io | | | |
| runtime | | | |
| （新） | | | 加行 |

---

## 8. 一句话

**默认三线起步；要扩就改 `docs/LANES.md` 加一行（目录+前缀+标签），Git 仍是 main + 短 feature 分支。**
