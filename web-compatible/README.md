# 可视化插件

> **状态：历史说明（面板版）。** 本文件描述的 MCP App 面板方案已从本目录移除，本目录改为纯网页端（浏览模板 → 复制模板名称 → 回对话粘贴）。现行方案见 [docs/plans/2026-10-29-web-only-plan.json](docs/plans/2026-10-29-web-only-plan.json)。完整 README 将在方案 phase 4 重写。

让用户在 Codex 插件面板中浏览模板 Skill 的全部官方示例图，手动选择一个或多个模板，再在对话框描述任务。选择作为对话参考提交，不需要复制提示词。

## 插件入口

0.2.6 使用 **Codex 插件 + MCP Server + MCP App**。插件包中的 Skill 仅提供模型调用规则；实际功能由 MCP 服务和宿主承载的交互面板实现。发行包只运行 stdio MCP 服务，不包含旧 HTTP 服务或 localhost 降级入口。面板采用 HTML，宿主负责承载和布局；它不等于原生 Swift 组件或输入框上方可见注释。

**客户端版本要求：宿主需为 `26.1023.51421` 或更新版本。** 实测 `26.1016.61520/62342` 与 `26.1021.31345` 会返回工具结果但从不创建 App 会话（无 `mcpServer/resource/read`、无 `session_created`），因此右侧面板不可能出现；换到 `26.1023.51421` 后同一条插件记录立即挂载并展开成功。升级后须完全退出并重开客户端，避免在“内存里是旧版、磁盘上已是新版”的状态下验证。

```bash
npm install
npm run build
codex plugin marketplace add "/Users/wxd/视频动画/可视化插件"
codex plugin add visual-template-gallery@visual-template-local
```

需要 Node.js >=20。发行包位于 `plugins/visual-template-gallery`，已打包依赖，不需要在安装目录运行 npm install。插件升级后须让宿主重新加载插件工具；当前旧会话未出现新工具时，刷新插件或重启 Codex 后再验证。

### 终端刷新 MCP

项目提供 `npm run reload:mcp -- --socket PATH`，通过 Codex 官方 `config/mcpServer/reload` 协议刷新 MCP 配置，不会强杀进程。命令使用 Unix socket 上的 app-server WebSocket 控制通道，成功时输出 JSON 结果；socket 不存在、不是 Unix socket 或宿主拒绝时退出码为 `2`，并明确显示“未终止任何进程”。

```bash
npm run reload:mcp -- --socket "$CODEX_APP_SERVER_SOCKET"
```

当前 Codex 桌面版通常将 app-server 以匿名 stdio 子进程启动，不暴露控制 socket，因此该命令会安全拒绝执行；它不能替代宿主的 Reload MCP 入口，也不会通过猜测 PID 来杀进程。只有使用带控制 socket 的 Codex app-server daemon，或宿主显式提供该 socket 时，终端刷新才可用。桌面版没有公开的单独 MCP restart 命令，仍需由宿主重新创建 MCP 连接才能切换已缓存的插件版本。

## 使用方式

1. 安装并启用插件后，在对话中说“打开 gpt-image-2-style-library 的全部模板”。模型调用 `open_template_gallery` 并传入目标 Skill 路径；也可以打开不带路径的 Skill 选择器。
2. 图库连接后自动请求展开，在本次验收的 Codex 版本中进入右侧扩展面板；若仍留在对话内，可点击“展开图库”重试。宿主未提供展开能力或拒绝时会显示实际状态，不能算右侧面板验收通过。在面板中分页、筛选、查看详情，点击“加入选择”，支持单选和多选。插件不启动 localhost 网页作为降级入口；宿主未挂载 MCP App 时应刷新或重启插件连接。
3. 只有宿主确认 `ui/update-model-context` 成功后，面板才显示“已同步”。此时回到对话框描述需求。移除或清空会提交新的完整参考快照；清空不会追加“已清空”文本注释。
4. 模型结合用户任务、目标 Skill 规则和所选模板工作；具体图片、网页或视频能力由宿主决定。完成生图或其他任务后，模型调用 `clear_template_context`，图库收到工具回执后立即取消选中并提交空上下文；若回执未送达，轮询会补偿同步。图库不会自动发消息或调用 Nopaper。

本机真实验收已确认右侧面板、完整模板、官方图、单选/多选、移除、清空、切换 Skill 撤销和宿主同步回执。下一条用户任务能否准确读取参考，以及跨对话隔离等剩余项仍需验证。**安装成功与协议测试通过不等于整体验收通过。** 当前验证情况见[验收记录](docs/2026-10-09-acceptance-result.md)。

自动展开在每个 App 实例上只发起一次（15 秒护栏），同一轮宿主创建多个实例时不会连锁请求；手动“展开图库”按钮不受限制。

## 模板来源与边界

不要求 Skill 作者采用本项目 manifest。支持 Markdown 标题/名称/ID、Markdown 模板表格、最简图片行与 GitHub 图片、HTML 图片、Cover/Preview、Example cases，也兼容 manifest、theme.json；没有 ID 可从名称生成。图片优先读取官方 GitHub 示例并缓存，不为预览生图。只有明确的模板名称或 ID 才会接入；Skill 品牌图、徽标和通用 README 图片会过滤。动态网页、远端资料未落地或图片与名称关系不明确时需补充索引，不能承诺所有 GitHub Skill 自动完整识别。

当前没有验证任意 Skill 调用的宿主事件接口，触发通过模型显式调用插件完成。插件不修改 composer，不承诺可见注释。缺少同步能力时必须显示未同步，不能把本地选择状态当作对话参考已提交。

## 开发与验证

```bash
npm run build
npm test
npm run typecheck
npm run test:app-host
```

最后一项启动 4180 协议测试宿主，用于 MCP App 浏览器交互测试，**不是 Codex 验收或产品入口**。项目没有 `dev`/`start` HTTP 服务脚本，生产插件不监听任何 TCP 端口。

### 宿主挂载诊断

图库 App 一旦被宿主挂载，就会调用仅 App 可见的 `report_app_state`，把连接结果、`hostContext`（displayMode / availableDisplayModes / capabilities）和显示模式协商结果追加写入 `~/.cache/visual-template-gallery/app-diag.jsonl`（超过 512 KiB 停止写入）。

判断方式：调用 `open_template_gallery` 后该文件**没有新行**，说明宿主从未创建 App 会话（右侧面板不可能出现，先查宿主挂载链路）；**有 `connected` 但没有 `display-request`** 说明宿主未提供 `fullscreen`（`display-skipped` 记录原因）；**有 `display-result` 且 `mode` 不是 `fullscreen`** 说明宿主拒绝展开。诊断只写本机文件，不改变图库、选择或对话状态。

## 回滚

使用 `codex plugin remove visual-template-gallery@visual-template-local` 停用本插件。旧独立 Skill 的原文保存于 `docs/history/legacy-gallery-skill.md`，仅作历史资料，不能恢复为当前运行入口。无需改动 Codex 应用安装文件或其他插件。

[设计与开发文档](docs/README.md)统一保存在本仓库。
