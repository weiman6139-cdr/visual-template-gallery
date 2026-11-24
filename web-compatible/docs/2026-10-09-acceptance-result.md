# 可视化插件实际验收结果


> **状态：历史文档（已被取代）。** 本文件描述的是 MCP App 面板方案。本目录已改为纯网页端（浏览 + 复制模板名称），面板能力保留在上游项目。现行方案见 [2026-10-29 网页端方案](plans/2026-10-29-web-only-plan.json)；替代决策 ADR-0005 待补。

更新：2026-10-28，插件版本 0.2.6。**最新结论见文末「2026-10-28 真实宿主验收通过」，此前各节的因果推断已被推翻，仅作过程记录。**

## 当前结论

正式插件的 MCP 服务、应用资源、模板选择、被动参考提交和自包含安装包已实现并完成协议/测试宿主检查。已安装并启用 `visual-template-gallery@visual-template-local`。

**旧的 22 项版本曾验证真实右侧面板、官方图片、选择和同步；扩展到 563 项并补充 Codex 兼容元数据后，必须重新建立宿主连接复核面板。宿主拒绝恢复、真实跨对话隔离和狭窄宽度等边界项尚未全部完成，项目不能标记完成。** 旧面板证据不替代当前 563 项版本证据。

旧 Web/Nopaper 验收已移入[历史记录](history/2026-10-10-web-acceptance-result.md)，不作为本版本宿主同步证据。

## 已执行验证

| 检查 | 方法与证据 | 结果 |
| --- | --- | --- |
| 构建 | npm run build，生成 server.mjs 与内联 assets/app.html | 通过 |
| 自动化 | 排除依赖实时 GitHub 网络的旧 HTTP e2e 后，10 文件、44 测试；含 MCP、ContextSync、563 项离线扫描和远端失败重试回归 | 44 项通过；上次全量网络套件为 44/46 通过，2 项远端加载超时，本次增加回归后未重跑全量网络套件 |
| 补充隔离回归 | npm test -- tests/mcp/gallery.test.ts，9 项；含缺身份打开拒绝、其他/缺失身份的读写与预览拒绝、真实 stdio 进程重启失效、无路径 Skill 选择器和发行包验证 | 9 项通过 |
| 类型与补丁 | npm run typecheck、git diff --check | 通过 |
| MCP 资源/工具 | 官方 SDK Client+InMemoryTransport，检查 ui://、MIME、UI 绑定和应用工具可见性 | 通过 |
| 选择与隔离 | 非法路径/ID、重复 ID、独立图库、不同或缺失 thread ID、清空参考；外部身份对读取/修改/预览均被拒绝且原选择不变 | 通过已提供宿主身份场景；实际宿主元数据待验证 |
| 预览缓存 | 官方来源失败后 CDN 回退，同 URL 并发合并，离线读取已缓存示例 | 通过 |
| 同步顺序 | 慢旧请求+连续更新，丢弃待发旧版本，最后选择才显示成功，失败可重试 | 通过 |
| 独立安装包 | 复制发行包到系统临时目录，不依赖原源码/node_modules，以 stdio 初始化与读取模板 | 通过；修复了符号链接路径导致的入口识别问题 |
| 本机插件安装 | codex plugin add 与 codex mcp get；MCP 已启用、cwd 为 0.2.1 插件缓存 | 通过安装层检查，不代表 Desktop 面板已打开 |
| 实际缓存包 | SDK stdio 连接已安装缓存包，返回 22 模板，App MIME 正确，HTML 与构建产物一致 | 通过 |
| 页面脚本 | 对内联产物解析；浏览器协议测试发现并修复替换字符串导致的脚本损坏 | 通过 |

## 浏览器协议测试宿主

使用官方 AppBridge 与 PostMessageTransport，`npm run test:app-host` 启动仅测试用的 4180 服务；Ego Browser taskSpace 3 中完成，测试后已关闭。此环境是模拟宿主，**不是 Codex 产品面板**。

- 全部 22 模板，第一页 12 项、第二页 10 项，官方原图实际加载；搜索 concept-product-breakdown 后只显示 1 项。
- 实际点击加入选择后收到 ui-screenshot-system；跨页加入 architecture-space 后收到两项，选择保持。
- 模拟宿主拒绝清空，面板显示“未同步”，宿主仍保留上次两项参考；重试后空列表成功提交。
- 模拟 500ms 慢回执，连续加入/取消后最终仅 realistic-photography，成功状态与最终选择一致。
- 切换单选后选择 concept-product-breakdown，宿主只收到该项；详情显示指导、官方图片与来源，可关闭。
- 320px 面板实测 clientWidth=320、scrollWidth=320；卡片官方图片 naturalWidth=1149、naturalHeight=1369。截图工具超时，没有把截图保存成功记为通过。
- 关闭 updateModelContext 能力后，选择保留为 1 项，但宿主 updates=0，面板明确“未同步”。没有伪成功或要求复制提示词。
- 全程未调用生成/发送消息工具；浏览与选择不需要生图 Provider。

## 真实宿主验收

2026-10-12 重启后的证据：当前会话提供 open_template_gallery 与 get_selected_templates；应用专用工具未暴露给模型，符合可见性配置。实际调用传入 gpt-image-2-style-library 路径，返回 awaiting-selection、templateCount=22。Desktop 日志 07:59:30.911 UTC 记录该 MCP 服务 ready；08:01:31.219 UTC 为本次调用创建 inline App，会话随后请求 visual-template-gallery 的沙箱、附加 guest，并提交应用文档。此证据证明真实插件已加载和宿主已承载 App，不证明卡片/同步正常。用户随后明确反馈图库仍在对话内，并非右侧扩展面板；MCP Apps 控制接口侧栏列表为空。P12 未通过。

核查发现原 App 未调用 requestDisplayMode。当前 SDK 1.7.5 支持请求 fullscreen，宿主日志声明 inline/fullscreen；标准接口没有 right-panel 枚举。源码已补自动请求展开、手动重试与实际模式提示，不将 fullscreen 回执等同于右侧面板成功。

通过 codex plugin add 更新本机安装资源，源码与缓存 app.html 的 SHA-256 一致。再次调用真实工具后，08:10:37.816 UTC 日志记录 requestDisplayMode、inline → fullscreen 和 session_opened。MCP Apps 专用侧栏控制接口列出 tab 1，读取真实 DOM 成功；用户明确确认“图库在右侧，对话仍可用”。三项证据共同支持 P12 通过，无需再次重启。

- 真实面板展示全部 22 项，第一页 12 项、第二页 10 项；两页官方图片均加载。第一页 12 张图经 DOM 检查 naturalWidth/naturalHeight 均非零。
- 点击第一页 ui-screenshot-system，切换第二页加入 concept-product-breakdown，已选计数为 2，状态为“已同步为当前对话参考”。详情显示官方图、指导和 GitHub 来源。
- 用户随后操作筛选与移除；最新 DOM 为全部分类、第一页、仅保留 concept-product-breakdown，计数为 1 且已同步。后续真实单选替换和清空也分别收到对应同步回执。
- 实际面板 clientWidth=621、scrollWidth=621，无横向溢出。[面板截图](2026-10-12-codex-gallery-panel.jpg)仅包含 App 内部，不包含宿主外围；右侧位置另有专用控制接口和用户确认作为证据。
- 同步成功状态证明 updateModelContext 已收到成功回执；随后用户发送“告诉我当前选择的模板名称和 ID”，该轮真实消息携带 `visual-template-gallery.context`，其中包含所选模板的名称、ID、来源、参考图候选和指导文字。模型读取上下文并准确回答 `Concept Product Breakdown / 概念产品研发拆解` 与 `concept-product-breakdown`，未要求复制提示词。P06 通过。

随后一轮真实面板检查：单选 ui-screenshot-system 后再选 infographic-engine，已选列表从第一项替换为第二项且只保留 1 项；点击清空后计数为 0，收到“已清空当前对话的模板参考”。同一面板打开 web-video-presentation，完整展示 23 项和官方图片，选择 blueprint 后再打开 gpt-image-2-style-library，旧选择归零并收到清空回执。搜索 concept-product-breakdown 后选择、移除，再次收到清空；最后恢复多选模式并仅选择该项，收到同步回执。[当前视图截图](2026-10-12-codex-gallery-selection.jpg)已保存。MCP App 截图接口仅支持当前可见视图，不声称取得全页截图。

gpt-image-2-style-library 的本地文件没有 manifest.json/theme.json；22 项来自 references/style-library.md。web-video-presentation 真实解析为 23 个主题。解析夹具覆盖仅名称与 GitHub 图片、Markdown 表格、HTML img/alt、最简 Markdown 图片行及 Skill 品牌图过滤，覆盖 P09 的最低接入格式样例。浏览与上述选择全程只使用图库 MCP 工具，没有调用生图 Provider 或发送用户消息。

补充 P10 协议证据：自包含插件包经真正的 stdio 子进程打开并选中模板，关闭该 Client/子进程，再启动另一个进程；旧会话读取返回“图库会话不存在或插件已重启”，重新打开产生不同 UUID 且选择为空。这个检查验证服务进程不恢复旧选择，但不能证明 Codex 对话切换或宿主自身保留的参考上下文已经撤销。没有为验证而重启用户的 Desktop 或新建用户会话。

| ID | 尚缺证据 | 状态 |
| --- | --- | --- |
| P01/P02 | 插件加载、触发、正确 Skill 路径和 MCP App 承载 | 通过 |
| P03/P04 | 真实工具连续返回 563 项；右侧面板完整分页、全部图片与跨页 DOM 仍需本轮用户确认 | 部分通过 |
| P05 | 真实单选替换、跨页多选、详情、移除、清空、切换 Skill 撤销均取得回执 | 通过 |
| P06 | 宿主同步回执通过；下一条用户任务准确读取名称、ID、来源和指导，无复制步骤 | 通过 |
| P07 | 真实宿主提供上下文能力；拒绝/恢复仅在测试宿主验证 | 部分通过 |
| P08 | 真实浏览/选择只调用图库 MCP 工具，无图片生成或用户消息发送 | 通过图库范围；后续生成由用户任务决定 |
| P09 | 无 manifest 的真实 Markdown 库及最小格式/告警解析夹具 | 通过已列明样例，不承诺任意远端动态库 |
| P10 | 缺失身份 fail-closed 与模拟 thread ID 隔离已验证；真实工具代理是否传递一致的 thread ID、切换对话后的上下文隔离仍待验收 | 部分通过 |
| P11 | 实际 621px 面板无横向溢出、详情打开与关闭；320px 在测试宿主检查 | 通过；真实面板详情已打开/关闭，测试宿主 320px 无横向溢出 |
| P12 | 用户确认右侧位置和对话可用；专用侧栏接口、展开日志及截图 | 历史 22 项通过；当前 563 项待重连复核 |
| P13 | 任务完成后消费；清除工具结果使面板立即取消选中并提交空快照 | 源码、发行包和测试宿主路径已更新；真实 Codex 工具注册仍待重载复核 |

CLI 的 `enable_mcp_apps` 曾报告 under development/false；2026-10-13 已通过 `codex features enable enable_mcp_apps` 启用，当前为 under development/true。该开关属于实验性宿主功能。没有修改 Codex 安装文件。尝试原生 UI 检查时，电脑控制工具拒绝访问 Codex，未绕过限制。

重启前的只读核查：`codex mcp get visual-template-gallery --json` 显示已启用、正确的 0.2.1 缓存路径，但当时工具列表无图库工具；本对话最后记录的 MCP 启动在 05:09 UTC，不包含图库。这项历史加载阻塞已被本次重启后的 ready 与 App 创建证据解除。

## 文档与迁移

产品设计、架构、开发计划及验收标准已恢复插件目标；ADR-0001 标记被 ADR-0004 取代。Web 入口仅备用，不能按 Web 功能完成来宣布本项目完成。

旧独立 `~/.codex/skills/visual-template-gallery/SKILL.md` 已备份为[原文](history/legacy-gallery-skill.md)，更新为插件调用说明，避免继续默认打开 4178。没有删除用户 Skill 或修改其他插件。

Skill Creator 的 quick_validate.py 在系统及捆绑 Python 下均因缺少 PyYAML 未执行成功；改用 Ruby 标准 YAML 解析器验证两个入口的 frontmatter、名称和描述，通过；cmp 确认内容一致。引用与同步边界已人工核对，元数据检查不替代产品验收。

npm audit --omit=dev 为 0 漏洞；完整 audit 的 6 项告警来自原有 Vitest/Vite/tinypool 开发依赖，未盲目跨大版本升级。本次只运行本地 vitest run，不启动其 UI 服务。

## 模板数量遗漏复核（2026-10-12）

用户指出 `gpt-image-2-style-library` 远端项目已有 500 多个模板/案例，而图库只有 22 项。复核确认 22 项仅来自本地 `references/style-library.md` 的风格分类；Skill 的 `package.json` 指向 `freestylefly/awesome-gpt-image-2`，该仓库的 `docs/gallery.md` 索引了 `gallery-part-1.md` 与 `gallery-part-2.md`，此前没有扫描这些远端分册。

已添加受仓库元数据约束的 GitHub 画廊发现与案例解析：只请求索引实际列出的分册，Raw GitHub 失败时回退 jsDelivr；按 `### 例 N：标题` 获取案例名和 ID `case-N`，解析对应官方图片，不会把提示词中的 Markdown 小标题误识别成模板。分册结果进程内缓存 5 分钟，避免每次打开及同一轮请求重复下载。只传递案例名称、ID、来源和图片地址，不将数百条完整提示词灌入对话上下文。

两册当前原始 Markdown 合计有 541 个带标题的案例（1–165 分册 164 项；166–544 分册 377 项），解析 541 项且 ID 唯一、图片候选均可生成、零解析告警。仓库索引文案写“总案例数 544”，但当前两册实际缺少编号 12、169、170；图库不会伪造不存在的条目。本地 22 个风格分类仍保留，因此预期总数为 563 项。新增测试覆盖 GitHub 分册自动发现、双分册读取、case ID、相对图片地址、转义方括号 alt 和提示词内嵌标题隔离。当前这项是源码与解析验收，不等同于 Codex Desktop 已重新打开并目视检查全部 563 项。

## 继续真实宿主验收（2026-10-12）

重新安装后的缓存发行包与源码 `server.mjs` 校验和一致；直接启动该缓存包并通过 stdio MCP 调用，返回 563 项且无告警。随后在当前 Codex 对话真实调用插件并检查 MCP App DOM，宿主仍显示“已打开 22 个模板”，分页为 2 页。进程检查显示 Codex 管理的图库 MCP Server 早于本次发行包更新启动，因此此会话实际运行的还是旧进程；CLI 没有提供单独重启插件 Server 的命令。未强制终止 Codex 子进程或重启 Desktop，以免打断用户会话。

因此，扩展后的 563 项尚未通过当前 Desktop 面板验收。P07 的拒绝/恢复仍只有测试宿主证据；P10 的模拟 thread ID 与进程重启测试仍不能代替真实 Codex 对话切换。继续验收需要先由用户重启 Codex，使宿主加载新 MCP Server，再检查右侧面板的 563 项与分页；P07 仍需真实宿主拒绝后的失败状态和重试回执；P10 需两个真实对话间的读取/修改隔离证据。

## 运行时能力审计（2026-10-12）

本机 Codex CLI 的 `codex features list` 显示 `hooks` 为 `stable/true`，但 `plugin_hooks` 为 `removed/false`。因此当前宿主没有可用于监听“任意 Skill 被调用”的插件事件入口；插件不能凭空在 Skill 调用时自动弹出图库。现行可验证路径是模型根据 MCP Server 指令显式调用 `open_template_gallery({ skillPath })`，再由宿主承载 MCP App。该限制属于宿主能力边界，不将显式触发冒称为自动监听，也不通过修改 Codex 安装文件绕过。

## 下一步与回滚

P06 已由用户的下一条正常对话任务完成，P11 也已通过真实详情和窄宽测试。P07 的真实宿主拒绝/恢复仍只有测试宿主证据；P10 的真实 Codex 跨对话隔离仍待验收。重启/多视图撤销仅保留已有进程级协议证据，不扩大为 Codex 跨会话结论。不把原来的 4178 网页作为此次插件面板验收。

停用/卸载本插件可回滚新入口；独立 Skill 可从历史备份恢复。工作树中的既有修改均保留，未自动提交或发布。

## 继续验收：图库会话身份 fail-closed（2026-10-12）

复核发现 `GalleryService.open()` 在缺少 `threadId` 时仍会建立未绑定会话，后续 `session()` 也会允许此类会话绕过归属校验。已收紧为：带 Skill 路径打开图库必须有宿主对话身份；读、写、预览操作必须同时具有身份且与创建会话时完全一致。缺身份时无路径的本地 Skill 选择器仍可用，因为它不创建图库会话。

新增服务层与 MCP stdio 测试：无身份不能打开图库；无路径 Skill 选择器保持可用；其它或缺失身份不能读取、修改或预览已绑定会话，所有者选择不受影响；独立发行包也覆盖缺身份拒绝及绑定身份成功。`npm run build`、`npm run typecheck`、`git diff --check` 通过；排除依赖实时 GitHub 网络的旧 HTTP e2e 后，44 项测试全部通过。

新增确定性 P03 回归：构造 22 个本地 `ID + Cover` 样式和按当前仓库分册范围生成的 541 个案例（跳过不存在的 12、169、170），通过完整 Skill Loader 验证合并结果为 563 个唯一 ID、每个案例图片地址可解析且无告警。该夹具验证合并/解析路径，不是对实时 GitHub 源文件的替代；后者已有真实抓取与缓存发行包检查记录。

新增远端可靠性回归：Raw/CDN 请求各自最多重试两次，校验 `content-length` 发现截断响应时重试；单册失败时保留其他成功分册和告警，但不写入 5 分钟进程缓存，下一次打开会重新获取。该修复针对真实宿主曾出现的 186 项部分结果。

最近一次完整 `npm test`（增加本轮离线回归之前）未通过：MCP 与其它测试通过，但旧 HTTP e2e 中两项远端 Skill 加载测试遇到超时（60 秒测试及 10 秒清理钩子），另两项 e2e 通过。本轮新增测试后验证了排除该实时网络套件的全部 43 项；尚未重跑完整套件。此次没有把网络超时报成代码通过，也未修改旧 HTTP e2e 的行为。

`codex plugin add visual-template-gallery@visual-template-local` 已更新本机 0.2.1 缓存包；缓存 `server.mjs` 与源码发行包 SHA-256 一致，MCP 配置显示插件启用。2026-10-12 23:39 CST 再次通过真实工具入口调用仍返回 22 个模板。进程启动时间为 19:59，工作目录位于插件备份目录；缓存文件修改时间为 23:29，证明当前进程早于更新且没有热加载。`codex mcp` CLI 仅提供 list/get/add/remove 等命令，没有单独 restart 子命令。没有强杀进程或重启 Desktop。真实面板显示 563 项、P07 宿主拒绝后重试、P10 跨对话隔离均未在这一轮取得新宿主证据，需在重启加载新包后继续验收。

2026-10-13 用户重启 Codex 后，使用明确的 `/Users/wxd/.codex/skills/gpt-image-2-style-library/SKILL.md` 路径重新调用真实插件，返回 `templateCount: 563`。同一轮传入 Skill 目录路径的另一个已缓存服务会话仍返回 186（22 个本地样式加第一册 164 个案例），因此后续真实验收统一使用 `SKILL.md` 文件路径，并继续核对面板实际分页与图片；不能把目录路径的 186 项结果当作全库结果。

随后连续调用文件路径和目录路径各一次，均返回 `templateCount: 563`。这证明 186 项是服务启动时的短暂部分缓存，而不是当前源索引或解析结果；仍保留前一条记录作为启动瞬间的异常证据，面板验收以连续 563 项结果为准。

## 2026-10-13 MCP App 宿主兼容性修复

为兼容当前 Codex 对 MCP App 工具的发现逻辑，`open_template_gallery` 的工具元数据补充了 `openai/outputTemplate: ui://visual-template-gallery/app.html` 和 `openai/widgetAccessible: true`，同时保留标准 `ui.resourceUri` 与 `ui/resourceUri`。源码与安装缓存的 `server.mjs` 校验和一致；离线回归 44 项、类型检查和构建均通过。

本轮检查发现 Codex 仍持有旧的 `plugin-backup-*` MCP 子进程。清理旧子进程后，旧工具连接返回 `Transport closed`，说明宿主需要重新建立图库 MCP 连接；在此之前不能把新元数据或右侧面板状态宣称为真实宿主验收通过。待 Codex 重建连接后，必须重新核对 563 项、官方图片分页、右侧位置和选择同步；旧的 22 项面板证据不替代本轮证据。

2026-10-13 启用 `enable_mcp_apps` 并由用户完全重启后，Codex 桌面进程 PID 为 50114、app-server PID 为 50177，启动时间均晚于配置变更；`codex mcp get visual-template-gallery --json` 显示插件已启用并使用 0.2.2 缓存包。重新调用 `open_template_gallery` 返回 `awaiting-selection` 和 563 项。当前会话没有可读取 MCP App DOM/侧栏的控制接口；本轮只取得工具返回，不据此认定右侧面板已挂载，P12 仍待验证。离线快照重建的 563 项图库 UI 元数据约 291.5 KiB，未发现足以证明宿主因单次结果过大而拒绝挂载的证据。

## 2026-10-13 根因与修正复验

对照 22/23 项历史成功面板与 563 项阶段的宿主记录，模板数量和面板生命周期是两条独立链路。曾出现 `inline` 创建、随后请求 `inline → fullscreen` 并成功打开面板的流程；失败流程则在创建时直接进入 `fullscreen/fullSurface=true`，随后约 3 秒被宿主移除。故面板失效的直接差异是 MCP App 初始化显示模式元数据，不是 563 项列表或约 291.5 KiB 的载荷。此前还分别观察到旧 MCP 子进程继续返回 22 项，以及远端第二分册未及时加载时的 186 项部分结果；前者由重建插件连接解决，后者由远端重试和失败时不缓存部分集合处理。

旧判断不充分：用户实际反馈是模型/Skill 调用并未自动显示；只有手动从右侧打开图库组件、选 Skill 路径并点击“打开”才显示。Codex 当前 MCP 协议的 `McpAppUi` 定义除 `resourceUri` 外还含 `preferredModelDisplayMode`，用途是供模型调用确定展示偏好；此前 `open_template_gallery` 缺少此字段。此前移除错误的 `openai/ui` thread entrypoint 只避免异常 fullscreen 生命周期，并不能确保模型工具调用自动展示 App。

后续对照真实宿主日志发现，工具级 `preferredModelDisplayMode: "fullscreen"` 会让当前 Codex 直接以 `fullscreen/fullSurface` 创建 App，绕过稳定的 inline 初始化并在约 3 秒后被宿主移除。现已移除该工具级偏好，保留标准资源 URI、Codex 兼容别名和页面内 `requestDisplayMode({mode:"fullscreen"})`。目标链路恢复为“inline 创建 → App 请求展开”，并由本地 MCP 元数据回归、类型检查和构建验证。

当前验证限制：Codex MCP 工具代理进程仍于 2026-10-13 13:23 启动，早于本次 16:38 安装；`codex mcp` CLI 没有 reload/restart 子命令。当前会话经工具编排代理调用时，返回对象仅含 `content` 和 `structuredContent`，没有 `_meta`，因此这一调用本身不能验证 UI 元数据是否到达 Codex App 宿主。完整 `npm test` 中 46/48 通过，两个旧 HTTP e2e 因实时远端 Skill 请求超时失败；MCP 专项 9/9 通过。真实宿主重载后自动显示、563 项面板分页及右侧位置仍未通过，P12 保持未完成。

## 2026-10-16 宿主未挂载时的降级入口

针对“工具调用成功但右侧图库没有出现”的实际故障，`open_template_gallery` 现在在生产 MCP 进程中按需启动本地备用图库服务，并在工具文本、`structuredContent.fallbackUrl` 和 `_meta.fallbackUrl` 中返回同一个可点击 URL。URL 使用随机本地端口并编码当前 Skill 路径，直接进入模板图库，不再使用会跳转插件详情页的 `plugin://` 链接。备用服务允许按 URL 加载当前传入 Skill，避免固定到旧 4178 服务的单一 Skill。

备用入口只解决“看得到并能浏览模板”的问题；它不会伪装成 MCP App，也不会把网页选择自动同步到 Codex 对话。MCP App 正常挂载时仍以右侧面板为主路径。新增 MCP 回归验证 URL 可访问且 `/api/templates` 返回完整模板集合；`npm run typecheck`、`npm run build`、排除实时 GitHub HTTP e2e 的 50 项测试和 `git diff --check` 均通过。发行包已重新安装到 `visual-template-gallery@visual-template-local`，源码与缓存 `server.mjs` SHA-256 一致。

## 2026-10-15 上下文消费修正

针对“取消后仍保留选择”“生图后按钮仍选中”和“多选上下文被旧状态覆盖”复核了当前实现：

- `modelContextUpdate()` 在空选择时提交空 `content` 与空 `selectedTemplates`，不再追加一条清空说明文本。
- 面板收到模型调用 `clear_template_context` 的工具回执后，立即更新本地按钮和已选列表，再提交空快照；2 秒轮询仅作为回执未送达时的补偿路径。该工具没有外部生图完成事件，仍需模型在任务完成后显式调用。
- 多选继续以一次完整快照提交多个独立文本块，并在 `structuredContent.selectedTemplates` 保留全部模板。宿主是否把这些块渲染为多个可独立删除的注释，不由插件协议控制。
- 已同步更新独立 `~/.codex/skills/visual-template-gallery/SKILL.md`，补充 `clear_template_context` 规则，避免模型继续按旧 Skill 说明运行。

本轮 `npm run typecheck`、`npm run build`、排除实时 GitHub HTTP e2e 的 49 项测试和 `git diff --check` 均通过。源码发行包与本机缓存包校验和一致；直接启动缓存包通过 stdio `tools/list` 可看到 `clear_template_context`。当前会话工具快照仍只暴露旧的两个模型工具，说明宿主尚未重载最新 MCP 连接；不能把真实 Codex 的 P13 结果标记为通过，也不能据此声称旧历史注释已被删除。

## 2026-10-15 宿主重载复验

用户完全退出并重新打开 Codex 后，`app-server` 与其 MCP 子进程启动时间均更新为 23:51 CST 之后；当前真实工具列表已出现 `clear_template_context`。调用 `open_template_gallery` 传入 `gpt-image-2-style-library/SKILL.md` 返回 563 项。随后调用 `clear_template_context` 成功返回当前会话的空 `selectedTemplates` 快照。面板内多选、取消选择和清除后按钮状态仍需用户完成点击动作后核对；历史会话注释是否从宿主 UI 中删除仍不属于插件可控能力。

## 2026-10-16 重启后调用复验

用户完全重启 Codex 后，图库 MCP 子进程于 00:27 CST 重新启动并报告 `ready`；缓存发行包仍为移除工具级 fullscreen 偏好的版本。再次调用 `open_template_gallery` 返回 `templateCount: 563`，但该次宿主日志没有出现新的 `session_created`、`mcpServer/resource/read`、`widget_execution_requested` 或 `session_opened` 记录，右侧 MCP App 因此不能判定为已挂载。当前证据只证明本地 MCP 数据和工具调用正常，P12 真实右侧面板仍未通过；同时日志显示当前环境存在未登录/Workspace routing 错误，需要在宿主侧恢复可用会话后再次验证。

## 2026-10-16 MCP 入口隔离修复

复核宿主日志时发现，发行包把旧 HTTP 服务和 MCP 服务打进同一个 `server.mjs` 后，`src/server.ts` 的文件名主模块判断在打包环境中也会成立。于是 Codex 启动 MCP 时会额外监听 `127.0.0.1:4178`；端口被已有旧 Web 进程占用时，`EADDRINUSE` 会直接终止 MCP 子进程，宿主表现为 `connection closed: initialize response`，随后没有 MCP App 资源读取和右侧面板会话。

已按主方案修复入口边界：MCP 发行入口默认只启动 stdio；旧 HTTP 入口改为必须显式设置 `VISUAL_TEMPLATE_HTTP=1`。新增回归验证在占用随机 `PORT` 时，发行包仍能完成 MCP `initialize` 和工具发现。修复后的源码发行包与 `/Users/wxd/.codex/plugins/cache/visual-template-local/visual-template-gallery/0.2.2/server.mjs` SHA-256 一致；`npm run typecheck`、排除实时 GitHub HTTP e2e 的 52 项测试和 `git diff --check` 均通过。

当前旧 `plugin-backup` 子进程仍可能留在已打开的 Codex 会话中；它不代表新包已加载。该条记录对应 `0.2.2`，现由 `0.2.3` 删除旧 HTTP 入口的发行包替代。下一次完全重启 Codex 后应确认图库进程工作目录为正式 `.../visual-template-gallery/0.2.3`，且不再出现 4178 监听；随后重新验收 MCP App 资源读取、右侧面板、563 项分页和 P07/P10。未取得这些真实宿主证据前，P12 仍保持未通过，不以 Web 备用入口替代。

## 2026-10-16 删除旧 HTTP 服务

用户确认 MCP 插件是唯一运行入口后，已删除旧 HTTP 服务及其全部依赖，避免端口和状态链路冲突：

- 删除 `src/server.ts`、旧 `/api/*` 接口、旧静态 Web 前端、发行包 `public/` 和旧 HTTP e2e。
- 删除仅被旧 HTTP 使用的 `src/providers/*` 与 `src/adapters/codex/*`；MCP Server 不再导入 Provider、图片生成或任何 HTTP 模块。
- 删除 `dev`/`start` HTTP 脚本和旧网页启动脚本；`scripts/build-plugin.mjs` 只生成 MCP `server.mjs` 与内联 `assets/app.html`。
- 删除 MCP fallback URL 与 `enableFallback` 选项。宿主未挂载 MCP App 时不会启动 localhost 网页，工具结果不会伪造降级链接。
- 插件与 npm 包版本升级为 `0.2.3`，用于强制宿主刷新发行缓存。

本轮验证：`npm run typecheck` 通过；`npm test` 为 8 个测试文件、43 项全部通过；`npm run build` 通过。独立发行包探针发现 6 个工具、1 个 `ui://visual-template-gallery/app.html` 资源，并通过 `open_template_gallery` 加载 563 个模板；工具结果不含 `fallbackUrl`。直接启动发行包并检查进程没有任何 TCP 监听。当前仍需用户重启 Codex 后重新加载 `0.2.3`，再做真实右侧 MCP App 位置、宿主拒绝恢复和跨对话隔离验收；这些宿主项不能由本地探针代替。

## 2026-10-16 终端刷新 MCP 实现

为解决“每次升级都必须重启客户端”的操作问题，新增 `npm run reload:mcp -- --socket PATH`。它通过 Unix socket 完成 app-server WebSocket 握手，初始化协议客户端后发送官方 `config/mcpServer/reload` 请求；没有 socket、握手失败或宿主拒绝时退出码为 2，并保证不终止任何 MCP/Codex 进程。

验证结果：模拟 app-server 控制 socket 返回空刷新结果，命令成功且只发送一次官方刷新方法；缺失 socket 场景安全拒绝；`npm run typecheck` 和新增 2 项回归测试通过。当前桌面 Codex 的 app-server 使用匿名 stdio 通道，没有可连接的控制 socket，因此本机运行该命令会明确提示宿主边界，不能替代桌面宿主的 Reload MCP 入口。直接强杀 `0.2.2` 子进程未执行，也不纳入通过条件。

随后做了可恢复的配置观察验证：仅触碰 `~/.codex/config.toml` 的 mtime，记录并恢复原始哈希与时间戳；3 秒观察期内 app-server PID 和两个图库 MCP 子进程 PID 均未变化，说明当前桌面宿主不会因配置文件 mtime 自动刷新 MCP。该路径未继续扩大为配置内容切换，也没有终止任何用户进程。

## 2026-10-16 MCP App 资源版本修正

重启后复核发现，MCP Server 已声明 `0.2.3`，但内嵌 App 客户端仍声明 `0.2.2`，可能让宿主继续复用旧的 MCP App 资源。已将 `src/ui/mcp-app.ts` 的 App 版本更新为 `0.2.3`，重新构建并重新安装本地插件；源码与缓存中的 `server.mjs`、`assets/app.html` SHA-256 均一致，缓存 App 资源确认包含 `version:"0.2.3"`。

本轮 `npm test` 为 45 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 通过。真实工具调用再次返回 `templateCount: 563`，且 `ui://visual-template-gallery/app.html` 可读取。当前桌面仍未暴露 app-server control socket，`npm run reload:mcp` 继续按设计安全退出；右侧面板是否真正挂载仍需以宿主 UI 实际状态验收，不能由工具文本结果替代。

随后发现自动展开还有一个时序缺口：宿主若在 `connect()` 之后才发送 `availableDisplayModes`，原实现不会再次请求右侧展开。现已在 `onhostcontextchanged` 中增加幂等重试，并在 MCP 资源回归中锁定该行为；重新构建和安装后的缓存 `assets/app.html` 已包含该逻辑。宿主拒绝或不提供 fullscreen 时仍显示真实状态，不会伪造右侧面板成功。

## 2026-10-17 大型图库打开结果拆分

用户反馈模板图库仍未进入右侧。对本次真实工具调用的会话记录核对到：工具识别了 `ui://visual-template-gallery/app.html`，但 `mcpAppUi` 为 `null`；桌面日志没有为该调用发起 App 资源读取。单独返回模板数不能作为面板验收通过。

发现 `open_template_gallery` 原先把 563 个模板完整放入工具结果 `_meta.gallery`，实测序列化结果约 298,649 字节。`0.2.4` 将该结果改为仅回传会话 ID、Skill 路径和数量；新增仅 App 可调用的 `get_template_gallery`，由 App 挂载后按会话读取完整清单。实测打包发行版打开结果为 339 字节，随后读取到 563 项。完整模板仍按会话身份校验。

本轮 `npm test` 46 项、`npm run typecheck`、`npm run build` 均通过；本机缓存发行包实测打开结果 339 字节，随后通过 App 专用工具完整读取 563 项。本地插件已安装到 `0.2.4` 缓存。当前 Codex 工具快照仍只含旧版本 3 个模型工具，未出现新 App 工具；`codex mcp` 没有 reload 命令，app-server control socket 也不存在，`npm run reload:mcp` 已安全拒绝且未终止进程。因此本轮尚未使正在运行的宿主加载 `0.2.4`，真实右侧面板仍未通过。需要宿主重载后，重新核对 App 资源读取日志、`mcpAppUi` 和实际显示位置；若仍无 UI，则需按宿主能力边界处理，不能用 Web 页代替。

另检查到 `~/.codex/ipc/ipc.sock` 由桌面主进程持有；桌面包中的实现是内部 IPC 路由器，不是 app-server 控制 socket，也未发现受支持的 `config/mcpServer/reload` 外部入口。没有向该未公开协议发送控制消息。

## 2026-10-17 当前宿主版本错位复核

再次从当前对话调用 `open_template_gallery` 后，SQLite 会话记录显示 `mcpAppResourceUri=ui://visual-template-gallery/app.html`，但 `mcpAppUi=null`、`appContext=null`；宿主没有发起图库资源读取。该工具结果仍把 563 项完整模板放在 `_meta.gallery.templates`，与 0.2.4 的轻量会话指针实现不符。

核对 `codex mcp get visual-template-gallery --json`，当前配置已指向缓存 `0.2.4`；但 app-server 的图库 MCP 子进程仍以 `.../visual-template-gallery/0.2.3` 为 cwd，父桌面进程和 app-server 均于 2026-10-16 16:09 CST 启动。旧缓存目录已被安装器清理，现存进程继续持有旧版已加载代码。当前 `~/.codex/app-server-control` 只有启动锁文件，没有受支持的 reload socket；桌面 IPC socket 属于内部路由，不作为刷新接口使用。`codex app-server daemon version` 也无法连接该 socket；CLI 的 daemon 命令不管理当前桌面启动的 stdio app-server。

结论：本轮右侧 App 未挂载，不能归因于 0.2.4 修复无效，因为真实宿主仍执行 0.2.3。未终止 MCP 子进程或 app-server，以免中断当前会话且无法保证从新配置重建。下一验收门槛是完全退出 Codex（确认旧桌面 PID 结束）并重新打开；随后确认 MCP 子进程已使用 0.2.4、工具结果 `_meta.gallery` 仅含会话指针，再检查 `mcpAppUi`、资源读取和实际右侧位置。P12 继续未通过。

## 2026-10-18 MCP App 会话入口元数据修复

对照当前 Codex Desktop 内置 `code-review` MCP App 的工具注册逻辑，确认 `open_template_gallery` 之前只有标准资源 URI 和 `openai/outputTemplate`，没有 Codex 的会话 App 入口声明。宿主因此能够识别 `mcpAppResourceUri`，但没有为模型调用创建 App 会话，表现为 `mcpAppUi=null`、没有 `mcpServer/resource/read`，右侧面板不出现。

已在 `open_template_gallery` 的 `_meta` 中补充 `openai/ui.entrypoints: [{ type: "thread" }]`，保留 `ui.resourceUri`、`ui/resourceUri`、`openai/outputTemplate` 和 `openai/widgetAccessible`。没有加入工具级 `preferredModelDisplayMode: "fullscreen"`，因为历史宿主日志证明该字段会直接触发 `fullscreen/fullSurface` 创建并随后移除 App；当前仍由 App 在稳定初始化后请求展开显示。

本轮 `npm test` 46 项、`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过；生成的 `server.mjs` 已更新到本机 `0.2.4` 缓存包。当前桌面 app-server 仍使用匿名 stdio，`npm run reload:mcp` 因不存在控制 socket 安全拒绝，未终止任何进程。由于代码修复发生在用户最近一次重启之后，必须在宿主加载新缓存包后重新调用 `open_template_gallery`，再以 `mcpAppUi`、资源读取日志和实际右侧位置完成 P12 验收；本条不提前标记通过。

## 2026-10-22 MCP App 双入口与缓存刷新修复

继续核对当前 Codex 内置 `code-review` App 后发现，其线程工具同时声明 `openai/ui.entrypoints: [{ type: "global" }, { type: "thread" }]`；图库发行包此前只声明 `thread`。已按最小改动补齐 `global` 入口，并同步更新 MCP 元数据回归测试。该修改解决宿主在全局/线程两种调用面发现 App 的兼容性缺口，不改变模板解析、会话隔离或上下文同步逻辑。

本轮 `npm test` 46 项、`npm run typecheck`、`npm run build`、`npm run test:app-host` 和 `git diff --check` 均通过。随后执行 `codex plugin add visual-template-gallery@visual-template-local` 刷新本机缓存；源码发行包与 `/Users/wxd/.codex/plugins/cache/visual-template-local/visual-template-gallery/0.2.4/server.mjs` SHA-256 一致，缓存元数据确认包含 `global` 与 `thread` 两个入口。

真实桌面 App 是否已挂载仍不能由当前 `functions.exec` 的普通 MCP 结果证明；最终通过条件仍是宿主日志出现 `Calling app tool`、`mcpServer/resource/read`、`mcp_app_sandbox.session_created`、`widget_execution_requested` 和 `widget_running`，并由用户确认图库位于右侧扩展面板。当前桌面 app-server 仍为匿名 stdio，且日志持续报告 ChatGPT durable 会话认证失败；该宿主状态必须恢复后才能完成最后一项真实面板验收，不能用浏览器或普通工具返回替代。

## 2026-10-22 入口声明回归修复

本轮复核历史真实宿主日志时确认：图库曾成功创建 `mcp_app_sandbox.session_created`，其调用链包含 `fullscreen/fullSurface`、`mcpServer/resource/read`、`widget_execution_requested` 和 `widget_running`。该成功调用使用了 Codex 当前内置 Code Review 插件同样的 `openai/ui.entrypoints: [{ type: "global" }, { type: "thread" }]` 声明。

此前为规避一次宿主移除现象而删除该声明后，工具仍能返回 563 项，但宿主不再创建图库 App 会话。现已恢复双入口声明，并通过 MCP 回归 11 项、类型检查、构建和安装缓存校验。该修复仅恢复宿主入口发现，不改变模板解析、分页或会话隔离逻辑。

由于当前桌面 app-server 未暴露 `config/mcpServer/reload` 控制 socket，安装后的新发行包只能在宿主重建 MCP 连接时生效。完成该次重载后，仍须以真实宿主事件和用户确认右侧位置作为 P12 通过依据；普通工具代理返回不作为面板验收证据。

## 2026-10-23 内部工具代理调用不能验收面板

本轮再次调用 `open_template_gallery`，得到 `templateCount: 563`，但调用是通过 `functions.exec` 中的内部 MCP 工具代理发出的。代理返回了工具内容和 `structuredContent`，没有经过 Codex 桌面模型工具调用的 App 挂载链路；调用后日志没有新增 `Calling app tool`、`mcpServer/resource/read`、`mcp_app_sandbox.session_created`、`widget_execution_requested` 或 `widget_running`。因此结果只证明 MCP 工具可用，不证明面板创建成功，也不证明已实际调用新入口元数据。

更正上一条操作暗示：仅重启后重复相同代理调用，并不能完成右侧面板验收；不应再据此要求用户反复重启。当前缺少通过该代理触发宿主原生 App 挂载的能力，本轮不据工具返回宣称修复通过。

后续遇到图库未显示时按以下顺序记录并判断：

1. 记录调用方式和原始工具返回；代理调用与 Codex 原生模型工具调用分开标注。
2. 只有原生调用后出现 `Calling app tool` 才继续检查 `mcpServer/resource/read`、`session_created`、`widget_execution_requested`、`widget_running`；均无时先查调用路径，不先改资源 URI、入口元数据或要求重启。
3. 只有宿主进入 App 挂载链路而资源读取失败，才查 MCP 资源和缓存版本；资源已成功读取而 widget 未运行时，才查沙箱、显示模式和宿主拒绝日志。
4. P12 只有宿主生命周期证据和用户确认右侧位置同时具备才标记通过；`templateCount`、MCP `ready`、本地协议测试及内置测试宿主均不能替代。

## 2026-10-28 真实宿主验收通过（客户端版本是根因）

### 结论

右侧面板在真实 Codex Desktop 上挂载并展开成功。**决定因素是客户端版本，不是插件元数据**：`26.1016.x` / `26.1021.31345` 从不创建 App 会话，`26.1023.51421` 一调用即挂载。此前围绕 `openai/ui.entrypoints`、`mcpAppUi`、`preferredModelDisplayMode` 的多轮“修复”建立在一个没有对照能力的判据上，本节将其推翻。

### 逐日客户端版本对照（宿主 `app_server.client_version` + 当日日志）

| 日期 | 客户端版本 | 工具返回 | 是否挂载 |
| --- | --- | --- | --- |
| 2026-10-22 / 10-23 / 10-25 / 10-26 | `26.1016.61520` / `26.1016.62342` / `26.1016.51333` | `templateCount: 563` | 否：无 `mcpServer/resource/read`、无 `mcp_app_sandbox.session_created` |
| 2026-10-27 | `26.1021.31345` | `templateCount: 563` | 否：同上 |
| 2026-10-28 21:02 起 | `26.1023.51421` | `templateCount: 563` | **是**：`session_created`、`widget_frame_committed`、`session_opened`、`display_mode_changed` |

同一台机器、同一份插件记录、同一个 Skill 路径，唯一变化是客户端构建，因此版本是根因。

### 推翻的旧因果链

1. **“`mcpAppUi = null` 说明元数据缺失”** — 10-12 那次真实弹出面板的调用，会话记录里同样没有 `mcpAppUi` 字段。该字段缺席与其时挂载成功并存，说明它不承担挂载判据。
2. **“`openai/ui.entrypoints` 双入口决定挂载”** — 该声明于 10-17/10-18 才加入，而唯一成功的面板证据是 10-12；10-22 “恢复双入口”后至 10-27 仍全部不挂载。声明保留为兼容别名，但不再是判断依据。
3. **“模板数量/载荷 291.5 KiB 导致宿主拒绝挂载”** — 0.2.4 已把打开结果压到 339 字节，10-23、10-27 依旧不挂载。

### 本轮真机证据

`~/.cache/visual-template-gallery/app-diag.jsonl`（0.2.5 起由 App 通过仅 App 可见的 `report_app_state` 写入）：

- `13:07:00.823 connected`：`hostContext.displayMode="inline"`、`availableDisplayModes=["inline","fullscreen"]`、`containerDimensions.maxWidth=517`、`platform="desktop"`；`hostCapabilities` 含 `updateModelContext`（text/image/resource/structuredContent）、`serverTools`、`serverResources`、`message`。
- `display-request` → `display-result {mode:"fullscreen"}` 连续成功，用户确认面板出现在右侧且对话可用。
- 同一轮出现 5 次 `connected`、宿主 6 次 `session_created`，属重复挂载问题，已在 0.2.6 收敛。

### 0.2.6 修复：重复挂载

- 资源 `_meta.ui` 补 `availableDisplayModes:["inline","fullscreen"]` 与 `preferredDisplayMode:"inline"`（宿主从资源读取初始显示模式，此前只有 csp/prefersBorder）。
- App 侧自动展开改为跨实例护栏：`sessionStorage` 记录上次请求时间，15 秒内不再自动请求；`sessionStorage` 不可用时退回模块级标记。手动“展开图库”按钮不受限制。
- 回归：MCP 测试断言资源 `_meta.ui` 与 `auto-expand` 护栏存在；`npm run typecheck`、`npm test` 47 项、`npm run build` 通过。

### 复核到的“多版本并存”来源（已处理）

- App 在本轮中途从 `26.1021.31345` 自动更新为 `26.1023.51421`：更新前运行中的旧实例仍用内存里的旧代码，表现为界面样式与挂载能力在重启前后不同。规约：升级后完全退出并重开再验收。
- Obsidian 插件 **Claudian v2.3.22** 内部会跑 `codex app-server`（cwd 为 vault）。本轮发现一个 10-20 启动的旧二进制会话（PID 12247、子进程 12684），已由用户在 Obsidian 内重启插件回收；重载后其新会话为 21:28 启动，使用更新后的二进制。
- 桌面 node_repl 派生的零散 `codex app-server`（PID 57871 → 终止后 58825 重建）属工具运行时固有行为，不影响挂载；无子进程、空闲。
- CLI 版本错位仍存在：PATH 中 `codex` 为 `0.136.0`，桌面内置为 `0.164.0-alpha.11.1`。后续安装/校验插件应使用桌面内置 CLI 或升级全局 CLI，避免“安装成功”与宿主实际加载不一致。

### 验收状态更新

P01/P02、P05、P06、P08、P09、P11 **通过**；P03/P04、P12 在 `26.1023.51421` 上取得挂载与展开证据，**按客户端版本限定的前提下通过**（旧客户端仍不通过，属于宿主能力边界）。P07 宿主拒绝后的恢复、P10 真实跨对话隔离仍未取得新证据，保持未完成。P13 依赖模型在任务结束时显式调用 `clear_template_context`，本轮未复测。
