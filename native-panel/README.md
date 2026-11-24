# 可视化插件

让用户在 Codex 插件面板中浏览模板 Skill 的全部官方示例图，手动选择一个或多个模板，再在对话框描述任务。选择作为对话参考提交，不需要复制提示词。

## 插件入口

当前版本见 `package.json`（构建时同步到 `plugin.json`）。插件使用 **Codex 插件 + MCP Server + MCP App**。插件包中的 Skill 仅提供模型调用规则；实际功能由 MCP 服务和宿主承载的交互面板实现。发行包只运行 stdio MCP 服务，不包含旧 HTTP 服务或 localhost 降级入口。面板采用 HTML，宿主负责承载和布局；它不等于原生 Swift 组件或输入框上方可见注释。

**客户端版本要求：宿主需为 `26.1023.51421` 或更新版本。** 实测 `26.1016.61520/62342` 与 `26.1021.31345` 会返回工具结果但从不创建 App 会话（无 `mcpServer/resource/read`、无 `session_created`），因此右侧面板不可能出现；换到 `26.1023.51421` 后同一条插件记录立即挂载并展开成功。升级后须完全退出并重开客户端，避免在“内存里是旧版、磁盘上已是新版”的状态下验证。

```bash
npm install
npm run build
codex plugin marketplace add "/Users/wxd/视频动画/可视化插件"
codex plugin add visual-template-gallery@visual-template-local
```

需要 Node.js >=20。发行包位于 `plugins/visual-template-gallery`，已打包依赖，不需要在安装目录运行 npm install。插件升级后须让宿主重新加载插件工具；当前旧会话未出现新工具时，刷新插件或重启 Codex 后再验证。

## 使用方式

1. 安装并启用插件后，在对话中说“打开 gpt-image-2-style-library 的全部模板”。模型调用 `open_template_gallery` 并传入目标 Skill 路径；也可以打开不带路径的 Skill 选择器。
2. 图库连接后自动请求展开，在本次验收的 Codex 版本中进入右侧扩展面板；若仍留在对话内，可点击“展开图库”重试。宿主未提供展开能力或拒绝时会显示实际状态，不能算右侧面板验收通过。在面板中分页、筛选、查看详情，点击“加入选择”，支持单选和多选。插件不启动 localhost 网页作为降级入口；宿主未挂载 MCP App 时应刷新或重启插件连接。
3. 只有宿主确认 `ui/update-model-context` 成功后，面板才显示“已同步”。此时回到对话框描述需求。移除或清空会提交新的完整参考快照；清空不会追加“已清空”文本注释。**打开或切换图库不会自动清除旧参考**——浏览是只读动作，参考只在用户选择、移除或清空时替换。
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

### 客户端一致性自检

```bash
npm run doctor
```

只读检查，不修改文件、不结束进程。它回答的是"正在运行的东西和磁盘上的东西是否一致"，用于避免出现"看起来像退回旧客户端"的状态：

| 检查项 | 会拦下的回归 |
| --- | --- |
| 客户端安装包版本 vs 运行进程启动时间 | App 自动更新后旧进程仍在跑内存里的旧代码（UI 与能力都可能是旧的） |
| 插件缓存版本数量 / config.toml 是否启用 | 多版本并存、插件被禁用、缓存指向过期目录 |
| 图库 MCP 子进程 | 宿主仍持有旧的 MCP 子进程 |
| 最近一次挂载的 `displayMode` / 插件版本 / 呈现形态 | 直接以 fullscreen 创建（无内联阶段）、面板停在内联、视图未收到工具结果 |
| 今日 `Sign in to ChatGPT` 报错数量 | 登录/工作区异常导致客户端退到本地形态（表现为"像旧版界面"） |

退出码：`0` 通过、`1` 有需注意项、`2` 存在会导致插件不可用的问题。诊断记录现带 `pluginVersion`，可直接识别宿主是否仍在跑旧包。

### 只保留最新版本

```bash
npm run prune            # dry-run：只列出可清理项
npm run prune -- --yes   # 真正执行
```

它处理两件事，并且有明确的安全边界：

| 对象 | 处理 | 为什么 |
| --- | --- | --- |
| 同一插件下的旧缓存版本目录 | 删除（**前提：没有进程正在使用**） | 有进程占用的目录绝不删除，否则宿主会 ENOENT，比"旧版本"更糟 |
| 代码目录已被删除、仍在跑旧代码的本插件子进程 | 结束（SIGTERM），宿主下次调用会重建 | 这是"发版后行为还是旧的"的直接原因 |
| ChatGPT 客户端主进程 | **不处理**，只提示重启 | 强杀会中断当前会话；更新后必须完全退出重开 |

**换版本的唯一正确顺序**：发布新版本 → 让宿主重建连接（完全退出客户端，或结束旧子进程）→ 再验收。反过来做就会出现"缓存已是最新，但运行的是旧代码"。

### 宿主挂载诊断

图库 App 一旦被宿主挂载，就会调用仅 App 可见的 `report_app_state`，把连接结果、`hostContext`（displayMode / availableDisplayModes / capabilities）和显示模式协商结果追加写入 `~/.cache/visual-template-gallery/app-diag.jsonl`（超过 512 KiB 停止写入）。

判断方式：调用 `open_template_gallery` 后该文件**没有新行**，说明宿主从未创建 App 会话（右侧面板不可能出现，先查宿主挂载链路）；**有 `connected` 但没有 `display-request`** 说明宿主未提供 `fullscreen`（`display-skipped` 记录原因）；**有 `display-result` 且 `mode` 不是 `fullscreen`** 说明宿主拒绝展开。诊断只写本机文件，不改变图库、选择或对话状态。

## 回滚

使用 `codex plugin remove visual-template-gallery@visual-template-local` 停用本插件。旧独立 Skill 的原文保存于 `docs/history/legacy-gallery-skill.md`，仅作历史资料，不能恢复为当前运行入口。无需改动 Codex 应用安装文件或其他插件。

[设计与开发文档](docs/README.md)统一保存在本仓库。
