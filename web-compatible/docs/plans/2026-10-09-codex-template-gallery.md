# Codex 插件目标开发计划


> **状态：历史文档（已被取代）。** 本文件描述的是 MCP App 面板方案。本目录已改为纯网页端（浏览 + 复制模板名称），面板能力保留在上游项目。现行方案见 [2026-10-29 网页端方案](../plans/2026-10-29-web-only-plan.json)；替代决策 ADR-0005 待补。

修订：2026-10-16。开发目标为正式插件的 MCP App 与对话参考主链路，不按旧 Web 原型定义“完成”。沿用既有解析、缓存和分页知识；删除旧 HTTP、Provider 和旧 Web 资源，发行包只保留 MCP 服务与 MCP App。

## 阶段与完成条件

| 阶段 | 工作 | 完成条件 | 当前状态 |
| --- | --- | --- | --- |
| 1 入口与协议 | 插件清单、stdio Server、ui:// 资源、模型/应用工具权限、独立会话 | SDK 协议检查、隔离测试通过 | 已实现，通过协议测试 |
| 2 交互面板 | 官方预览、分页筛选、详情、单/多选、清空、同步回执及重试 | 构建可执行、测试宿主真实点击通过 | 已实现，协议测试宿主交互通过 |
| 3 安装分发 | 打包服务与 HTML，独立 marketplace，清除旧入口误导 | 脱离源码树启动、插件安装启用 | 已通过安装、真实工具加载与资源更新检查 |
| 4 Codex 主链路 | 实际右侧 App 打开、能力握手、选择提交、下一条用户任务读取参考 | P01-P12 按各项等级及证据要求验收 | 右侧、全库、图片、单/多选与撤销、回执及下一条任务读取已验证；宿主拒绝恢复、跨对话隔离和极窄宽度待验证，不能宣布完成 |
| 5 文档与交付 | 设计/架构/验收对齐目标，保留历史与回滚说明 | 未验证项不伪造通过 | 文档已修订，记录持续更新 |

## 必要实现文件

- src/mcp/server.ts、gallery-service.ts：工具、资源、模板会话与官方预览。
- src/ui/mcp-app.html/css/ts、context-sync.ts：宿主 App、被动参考提交、版本与失败处理。
- scripts/build-plugin.mjs：自包含插件构建。
- plugins/visual-template-gallery：清单、MCP 注册、应用资源与调用规则。
- tests/mcp/gallery.test.ts、tests/ui/context-sync.test.ts：协议、打包、隔离、回退、快速更新、重试。
- scripts/test-mcp-host.mjs 与 tests/fixtures/mcp-app-host.mjs：浏览器协议测试宿主。

## 验证顺序

```bash
npm run build
npm test
npm run typecheck
npm run test:app-host
```

浏览器测试覆盖快速多选、跨页、清空、失败重试、无上下文能力、窄面板。随后刷新 Codex 插件，验证实际工具、App、回执和下一条用户请求。测试宿主不能替代最后一步。

## 阻塞处理

若宿主缺少 MCP App 或 updateModelContext，记录实际能力/错误及环境；完成其他可验证工作，但保持插件核心验收未通过。不得重新把目标改回 Skill+网页，也不得修改 Codex 安装包绕过。

## 回滚与后续

可卸载本插件并保留独立 Skill 历史备份，不恢复旧 HTTP 入口。只在本阶段真实宿主验收完成后考虑其他 Agent；任意 Skill 自动事件监听与可见 composer 附件需另行能力验证。
