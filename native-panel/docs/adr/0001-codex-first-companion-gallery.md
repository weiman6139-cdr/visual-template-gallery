# ADR-0001: 当前阶段使用 Codex Skill 驱动的 Web 伴随图库

## Status

Superseded by [ADR-0004](0004-mcp-app-plugin-and-reference-context.md), 2026-10-12。

以下内容保留为历史决策，不再决定当前开发与验收范围。旧 Web 图库为备用；主交付恢复为 MCP App 插件和被动对话参考。

## Context

目标需要覆盖 Codex、Claude Code、Trae 和 Cursor，但四个 Agent 的扩展接口、Skill 触发机制和原生侧栏能力不一致。当前最重要的用户价值是尽快验证“完整模板可视化、手动选择、对话桥接”的核心流程。

## Decision

当前阶段只实现 Codex 插件包中的 Skill 入口，并使用本地 Web 伴随图库作为临时 UI。其他 Agent 适配器、Codex 原生 UI、任意 Skill 调用监听和会话注入均延后，不能在当前宿主能力未确认时宣称完成。

## Consequences

### Positive

- 降低首版开发和验证成本。
- 能优先验证模板解析、分页选择和上下文桥接。
- 不依赖四个平台共同具备相同的原生 UI 扩展能力。

### Negative

- 第一版不能直接服务其他三个 Agent。
- Web 伴随面板不等同于 Codex 原生右侧栏注入。
- Skill 入口不等同于宿主级插件事件监听。
- 本地选择会话不等同于 Codex 当前对话上下文。

## Alternatives Considered

- 同时开发四个适配器：范围过大，容易把宿主差异问题和核心功能问题混在一起。
- 只做独立 Web 应用：无法直接完成 Codex 当前对话的上下文桥接，因此当前必须明确标注为临时伴随方案。

