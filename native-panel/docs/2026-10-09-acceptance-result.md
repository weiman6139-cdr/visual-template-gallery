# 可视化插件验收现状

更新：2026-10-28，插件版本 0.2.9。
本文件只写**当前有效**的结论与证据；被推翻的推断、逐日调试过程完整保留在[历史验收日志](history/2026-10-acceptance-log-legacy.md)。

## 一、当前状态

| 项目 | 状态 | 依据 |
| --- | --- | --- |
| 客户端门槛 | **Codex `26.1023.51421` 或更新** | `26.1016.x` / `26.1021.31345` 从不创建 App 会话；`26.1023.51421` 一调用即挂载 |
| MCP 服务 / 工具 | 通过 | 6 个工具 + 1 个 `ui://` 资源；模型可见工具收敛为 `open_template_gallery`、`clear_template_context` |
| 右侧面板挂载与展开 | **通过（真机）** | `mcp_app_sandbox.session_created`、`widget_frame_committed`、`display_mode_changed`、`session_opened`；`display-result {mode:"fullscreen"}` |
| 模板全量 | 通过 | `gpt-image-2-style-library` 解析 563 项（本地 22 + GitHub 两册 541） |
| 官方示例图 | 通过 | 分页加载，GitHub raw 失败回退 jsDelivr |
| 单选 / 多选 / 移除 / 清空 | 通过（真机） | 面板操作后宿主收到对应同步回执 |
| 参考上下文可被模型读取 | 通过（真机） | 下一轮用户消息携带 `visual-template-gallery.context`，模型准确回答所选模板名称与 ID |
| 宿主同步能力 | 通过 | `hostCapabilities.updateModelContext` 存在；缺失时面板显示“未同步”而不是假成功 |
| 会话隔离 | 部分通过 | 缺身份 fail-closed、跨身份读写拒绝已测；真实跨对话隔离未测 |
| 宿主拒绝后的恢复 | 未完成 | 仅在测试宿主验证过“拒绝→显示未同步→重试成功” |

**未完成项不足以宣布整体完成**：安装成功、协议测试通过、工具返回模板数量，都不能替代真实面板与后续对话的证据。

## 二、本版本（0.2.8 / 0.2.9）的实际改动

0.2.8（性能与可维护性）：

- 资源读取在进程内缓存，避免每次 `resources/read` 重复读 539 KB 文件；
- 选择轮询 2s → 5s，`document.hidden` 时跳过；
- 预览图缓存改为 LRU（上限 50 张），避免全量 base64 常驻沙箱内存；
- 版本号单一来源：`package.json` → 构建时注入两个产物，并自动同步 `plugin.json`；
- 删除 `reload:mcp`：桌面版 app-server 无 control socket，该命令在目标环境不可用。

0.2.9（语义与结构）：

- **打开图库改为只读**：不再在加载完成时提交空快照，参考只在用户选择、移除或清空时替换；
- 面板复用 `src/ui/gallery-state.ts` 的 `filterTemplates` / `pageCount` / `pageItems` / `toggleSelection`，删除面板内的重复实现（副作用：搜索现在也会匹配分类名）。

## 三、历史与更正（此前结论已推翻）

以下三条曾指导过多轮开发，现已被真机证据否定，仅保留以便复核，不再作为判断依据：

1. **“`mcpAppUi = null` 说明工具元数据缺失”** —— 10-12 弹面板成功的调用同样没有该字段。
2. **“`openai/ui.entrypoints` 双入口声明决定宿主是否挂载”** —— 该声明 10-18 才加入，而成功证据在 10-12；10-22 之后至 10-27 仍全部不挂载。
3. **“563 项 / 291.5 KiB 载荷导致宿主拒绝挂载”** —— 0.2.4 已把打开结果压到 339 字节，10-23、10-27 依旧不挂载。

真正的变量是**客户端构建版本**，逐日对照与宿主日志证据见[历史日志的 2026-10-28 一节](history/2026-10-acceptance-log-legacy.md)。

同时记录一个运维风险：App 自动更新期间旧进程仍运行内存中的旧代码，界面样式与挂载能力会与磁盘上的新版本不一致。**升级后必须完全退出并重开客户端再验收。**

## 四、当前验收方式

```bash
npm run typecheck
npm test                 # 45 项
npm run build            # 生成 server.mjs 与内联 assets/app.html
codex plugin add visual-template-gallery@visual-template-local
```

真机验证要点（缺一不可）：

1. 宿主版本 ≥ `26.1023.51421`；
2. 原生模型工具调用后出现 `mcp_app_sandbox.session_created` 与 `resources/read`；
3. `~/.cache/visual-template-gallery/app-diag.jsonl` 出现 `connected` 与 `display-result`；
4. 用户确认面板位置与“对话仍可用”。

诊断文件读法见 [README 的“宿主挂载诊断”](../README.md)。

## 五、回滚

`codex plugin remove visual-template-gallery@visual-template-local` 停用插件；旧独立 Skill 原文见[历史备份](history/legacy-gallery-skill.md)。插件代码回滚使用仓库提交历史，构建产物不进 git（需先 `npm run build`）。
