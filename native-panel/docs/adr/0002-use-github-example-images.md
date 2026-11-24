# ADR-0002: 直接使用 GitHub 官方示例图作为模板预览

## Status

Accepted

## Context

模板 Skill 对应的 GitHub 仓库已经提供模板封面和示例案例。重新调用生图模型为每个模板生成预览会增加时间、成本和风格偏差，也不能保证与原始模板示例一致。

## Decision

插件直接解析 Skill 中的 GitHub 来源并获取官方示例图，采用本地缓存和分页图库展示。模板预览阶段不调用生图模型。

## Consequences

### Positive

- 预览速度快，样式与源仓库一致。
- 不产生额外生图费用。
- 用户可以直接比较真实模板效果。

### Negative

- 依赖 GitHub 链接稳定性和网络访问。
- 外部图片可能失效、限流或发生路径变化。

## Alternatives Considered

- 本地重新生成预览图：慢且成本更高。
- 只展示文字模板：无法满足可视化选择目标。

