# 模板可视化插件架构


> **状态：历史文档（已被取代）。** 本文件描述的是 MCP App 面板方案。本目录已改为纯网页端（浏览 + 复制模板名称），面板能力保留在上游项目。现行方案见 [2026-10-29 网页端方案](plans/2026-10-29-web-only-plan.json)；替代决策 ADR-0005 待补。

修订：2026-10-16。主路径采用 Codex 插件、stdio MCP Server 和宿主 MCP App，复用现有模板解析与缓存。旧 HTTP 服务、Provider Router 和旧 Web 资源已删除，避免与 MCP 进程产生端口和入口冲突。

## 主数据流

```text
Codex 模型 → open_template_gallery → MCP Server → Template Core
                              ↓ ui:// 应用资源          ↓ GitHub 官方示例/缓存
                        Codex MCP App ← get_template_preview
                              ↓ 用户选择
                        select_templates → 结构化参考
                              ↓ ui/update-model-context
                        宿主确认 → 后续用户任务 + 模型参考
```

## 组件

| 组件 | 实现 | 职责 |
| --- | --- | --- |
| 插件包 | plugins/visual-template-gallery | 清单、MCP 注册、打包服务和应用资源；Skill 只说明调用规则 |
| MCP Server | src/mcp/server.ts | 工具和 UI 资源注册，stdio 通信，宿主元数据解析 |
| GalleryService | src/mcp/gallery-service.ts | Skill 加载、独立会话、选择校验、被动参考和官方预览 |
| Template Core | src/core | 现有 manifest、Markdown、theme 解析、图片地址解析与缓存 |
| MCP App | src/ui/mcp-app.* | 分页、筛选、选择、详情及宿主桥接 |
| ContextSync | src/ui/context-sync.ts | 串行提交，合并过时待发选择，回执与失败状态 |
| 构建 | scripts/build-plugin.mjs | 自包含 server.mjs 和内联 assets/app.html |
| 测试宿主 | scripts/test-mcp-host.mjs | 官方 AppBridge 协议验证，不是生产入口 |

## MCP 接口

- `open_template_gallery({skillPath?})`：模型/应用可用。省略路径显示本地 Skill 选择器；指定路径加载全部模板。应用数据在 `_meta.gallery`，模型只收到等待选择状态和数量。
- `get_template_gallery({sessionId})`：仅应用可用。打开工具只传会话指针，面板启动后再读取模板清单，避免将整个图库放进模型工具结果。
- `list_template_skills({})`：应用列举 ~/.codex/skills、~/.agents/skills；列举不保证每项有模板。
- `select_templates({sessionId,selectedIds})`：应用提交 ID，校验、去重、保持顺序，返回被动参考。
- `get_template_preview({sessionId,templateId})`：应用读取已加载模板的官方示例，返回允许的图片 data URL。
- `get_selected_templates({sessionId})`：面板轮询当前会话参考；`visibility: ["app"]`，不对模型暴露；不代表宿主已接受同步。
- `clear_template_context()`：按当前对话身份消费最近图库会话；模型在完成生图或其他任务后调用，面板轮询到空选集后提交空模型上下文。
- 资源 `ui://visual-template-gallery/app.html`，MIME 为 `text/html;profile=mcp-app`，工具 UI 元数据绑定资源。

## 状态与隔离

每次打开生成 UUID 会话，不复用全局选择。宿主提供 thread ID 时，后续读写和图片请求必须匹配，缺失或不同则拒绝。宿主不提供身份时，仅能依赖独立会话 token 与宿主工具代理的隔离，不能宣称已验证跨对话权限。进程重启使会话失效，要求重新打开。

选择变更先取得结构化参考，再调用宿主更新模型上下文。只有最后版本的成功回执可显示已同步。串行提交避免旧慢响应覆盖新选择；失败保留选择并可重试。清空提交空 `content` 和空 `selectedTemplates` 快照，不再追加清空说明文本。外部生图工具没有通用完成事件，因此由模型调用 `clear_template_context`；面板收到该工具结果时立即消费，轮询作为补偿。多个 App 在宿主中的上下文合并/撤销语义仍需实测。

## 图片与资料

复用现有本地索引，不强制 manifest。Markdown 标题、模板表格和 HTML 图片画廊均可作为轻量索引；解析无法覆盖任意远端动态内容，必须告警并保留来源。预览只使用模板中解析出的 HTTPS GitHub Raw/jsDelivr 地址；缓存相同 URL 的并发请求合并。应用通过 MCP 获取图片 data URL，不需连接本地 HTTP 或调用图片模型。当前支持 PNG/JPEG/WebP/GIF，SVG 未支持。

HTML 内联脚本和样式；生产应用没有任意外连权限，资源 CSP 允许 data/blob。模板文字通过 textContent 显示；参考内容作为数据处理。MCP 服务不导入 Provider Router，不持有生图凭证，不修改 Skill 源文件。

## 宿主依赖与运行边界

MCP 发行入口只启动 stdio MCP，不导入 HTTP Server、Provider Router 或任何生成接口，也不监听 4178 或其他 TCP 端口。生产发行包只包含 MCP Server 和内联 MCP App 资源；宿主未挂载 MCP App 时不再启动 localhost 降级网页，避免用户误用与当前对话脱节的旧入口。

应用声明支持 inline/fullscreen，连接后检查 availableDisplayModes 并调用 requestDisplayMode({mode:"fullscreen"})，也提供手动重试。fullscreen 是协议展示模式，不等同于右侧面板；宿主决定实际位置，必须通过真实 UI 核对。本次用户反馈仍未进入右侧，P12 未通过。

工具绑定同时发布标准 `ui.resourceUri`/`ui/resourceUri` 与 Codex 兼容的 `openai/outputTemplate`、`openai/widgetAccessible` 元数据。前者是 MCP Apps 协议入口，后者用于当前 Codex 宿主发现并挂载交互式 App；二者都不能单独证明右侧位置，仍须真实宿主核对。

面板与 `updateModelContext` 是两个独立宿主能力，必须分别验证。不存在公开接口的能力不通过应用注入、修改 Codex 安装包或自动发送会话实现。若宿主未挂载或拒绝，记录实际错误并重载插件，不通过本地网页绕过验收。

生成能力交给后续用户任务中的 Agent：优先用宿主当前可用工具，不固定模型或 sheng-tu。未来其他 Agent 的适配需验证各自 App/上下文协议，当前不增加抽象层。

## MCP 刷新边界

Codex app-server 协议提供 `config/mcpServer/reload`，但它属于 app-server 的上游控制请求，不属于 MCP Server 可以自行调用的工具。项目的 `npm run reload:mcp -- --socket PATH` 实现了该协议的本地安全客户端：通过控制 socket 的 WebSocket 通道完成初始化、刷新请求和结果读取；缺少 socket、握手失败或请求失败时不终止任何进程。

Codex 桌面宿主当前将 app-server 以 stdio 子进程运行，终端只能看到 MCP 子进程的父子关系，无法取得该匿名通道的可连接路径。因此不能把直接 `kill` MCP 子进程当作刷新方案：父进程可能不重启、按旧的进程内解析结果重启，或使已有 MCP App 会话失效。只有宿主暴露 control socket 或提供 Reload MCP 控制入口后，终端命令才能在不重启客户端的前提下刷新当前宿主；项目不实现 PID 猜测和强杀兜底。
