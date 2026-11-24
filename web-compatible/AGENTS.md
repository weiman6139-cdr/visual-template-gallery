# AGENTS.md — 本目录协作约定

本文件记录用户对本项目的明确要求与约束，任何后续改动都必须遵守。

---

## 1. 核心目标（不可偏离）

- 本目录产出的插件**只适配没有宿主 UI 的客户端**：Trae、WorkBuddy、Cursor、Claude Desktop 等普通 MCP 宿主。
- **不考虑 Codex。** 不引入任何 Codex 专有格式或清单：不得出现 `.codex-plugin/`、`marketplace.json`、Codex 的 `.mcp.json`（相对路径 + `cwd` 约定）等包装。
- 浏览界面必须是**插件自己启动的本地只读网页**；不使用 MCP Apps 面板能力：不得出现 `ui://` 资源、`displayMode`、`ui/update-model-context`。
- 用户选中模板后，通过**复制模板名称回到对话**传递选择；插件不自动注入上下文。

## 2. 改动边界（硬约束）

- 只允许修改：`/Users/wxd/pi-cwd-20260723/可视化插件（兼容版）/` 目录内的文件。
- **禁止跨目录改动**，包括但不限于：
  - `~/.codex/`（含 `config.toml`、`plugins/`、`skills/`）
  - `~/.trae-cn/`（含 `skills/`、`skill-config.json`）
  - `~/Library/Application Support/Trae CN/` 与 `TRAE SOLO CN/`（含 `mcp.json`、`state.vscdb`）
  - 其他任何用户目录
- **禁止**安装插件到客户端、**禁止**重启客户端、**禁止**写客户端配置或状态库、**禁止**跨目录复制或删除用户文件。
- 读取客户端日志仅限**只读排查**，不得修改。

## 3. 客户端侧验证由用户执行

- 需要客户端验证时，助手只提供**插件路径与安装说明**，由用户自行安装。
- 交付路径固定为：
  - 插件目录：`/Users/wxd/pi-cwd-20260723/可视化插件（兼容版）/dist/visual-template-gallery`
  - 技能文件：`/Users/wxd/pi-cwd-20260723/可视化插件（兼容版）/dist/visual-template-gallery/SKILL.md`
- 宿主配置里的 `command` 必须用 **node 绝对路径**（宿主 PATH 中没有 `node`，写 `node` 会连接失败）。
- `VTG_SKILL_ROOTS` 支持**逗号或冒号**分隔；多个目录都写绝对路径。

## 4. 调用与触发方式

- Trae 通过 **`/` 调用技能和插件**，**不需要 `@`**。
- 必须保持**被动显式唤醒**：
  - 仅当用户明确要求「打开/浏览模板图库」时，才调用 `open_template_gallery`。
  - 用户只是提到某个模板名称、或直接要求生成图片时，**不得**调用。
- 工具返回错误时，模型必须**如实转述错误原文**，不得自行读取 Skill 资料、自己生成 HTML、或用 `file://` 页面替代本工具。

## 5. 设计边界（不因测试数据而改变）

- 真实 Skill 的模板总数（例如 563）**只是测试样本，不作为设计依据**。
- 不做分页、不做虚拟滚动；顶部为「搜索框 + 分类下拉」两件套（2026-10-31 用户要求调整），配合图片懒加载。
- 复制出去的是**模板原名**（形如 `UI Screenshot System / UI 截图系统`），**不做编号、不加 ID 后缀**。
- 服务端约束：单活跃会话、只监听 `127.0.0.1`、随机端口、空闲 5 分钟失效、不使用 cookie、token 鉴权（API 用请求头、图片用查询参数）。

## 6. 工作纪律

- **先查清机制再动手**：涉及宿主行为必须先查源码/文档确认，禁止猜测式试错。
- 需求与实现方案有变更时，先说明取舍并确认，再实施。
- 小步提交；禁止 `git reset --hard`、`git checkout .` 等破坏性回滚，除非用户明确要求。
- 删除、覆盖、跨目录写入等破坏性操作，必须先获得用户明确同意。
- 每次改动后自查：是否越界、是否混入无关改动、构建与测试是否仍通过。

## 7. 构建与验证（均在项目内）

```bash
npm run build     # tsc + 打包插件，产出 dist/visual-template-gallery 四件套
npm test          # vitest
npm run typecheck # tsc --noEmit

# 生成可直接粘贴进宿主的 MCP 配置（只打印，不写文件）
node dist/visual-template-gallery/server.mjs --print-config
```

发行包固定为四件套：

```
dist/visual-template-gallery/
├── server.mjs   运行时，已打包依赖，无需 npm install
├── SKILL.md     技能文档，复制进宿主技能目录
├── mcp.json     通用配置模板（含占位符）
└── README.md    逐宿主安装步骤与排查表
```
