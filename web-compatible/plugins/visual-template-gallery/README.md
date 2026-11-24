# 可视化模板图库（纯本地网页版 MCP 插件）

面向**不支持 MCP Apps 面板**的宿主（Trae、WorkBuddy、Cursor、Claude Desktop 等）：
模板图库不是宿主内嵌面板，而是插件在本地启动的一个只读网页，用户选中模板后复制名称回到对话。

## 目录内容

| 文件 | 用途 |
|---|---|
| `server.mjs` | 唯一运行时产物，已打包全部依赖，无需 npm install |
| `SKILL.md` | 技能文档，放进宿主的技能目录，供模型判断何时调用 |
| `mcp.json` | MCP 配置模板，两个占位符需替换后粘进宿主配置 |

## 安装（任意 MCP 宿主）

### 1. 放置插件

把整个目录放到一个固定位置，例如：

```
/Users/<你>/plugins/visual-template-gallery
```

目录里的 `server.mjs` 用绝对路径引用，**不要**依赖宿主的当前工作目录。

### 2. 生成 MCP 配置

在插件目录内执行（只打印，不写任何文件）：

```bash
node ./server.mjs --print-config
```

或手工替换 `mcp.json` 里的占位符：

| 占位符 | 替换为 |
|---|---|
| `__INSTALL_DIR__` | 插件目录绝对路径 |
| `__SKILL_ROOTS__` | 模板 Skill 所在目录，多个用**逗号或冒号**分隔 |

`VTG_SKILL_ROOTS` 可省略，省略时默认取 `~/.codex/skills` 与 `~/.agents/skills`。

示例：

```json
{
  "mcpServers": {
    "visual-template-gallery": {
      "command": "node",
      "args": ["/Users/me/plugins/visual-template-gallery/server.mjs"],
      "env": { "VTG_SKILL_ROOTS": "/Users/me/.agents/skills,/Users/me/my-skills" }
    }
  }
}
```

### 3. 把配置粘进宿主

| 宿主 | 位置 |
|---|---|
| Trae | 设置 → MCP → 编辑配置（全局 `mcp.json` 的 `mcpServers`） |
| WorkBuddy | 设置 → MCP 服务 → 添加自定义服务 |
| Cursor | `~/.cursor/mcp.json` 的 `mcpServers` |
| Claude Desktop | `claude_desktop_config.json` 的 `mcpServers` |

`command` 若写 `node` 不生效（宿主 PATH 里没有），改成 node 的绝对路径，例如 `/usr/local/bin/node`。

### 4. 安装技能（可选但推荐）

把 `SKILL.md` 复制到宿主的技能目录：

| 宿主 | 位置 |
|---|---|
| Trae | `~/.trae-cn/skills/visual-template-gallery/SKILL.md`（旧版 `~/.trae/skills/`） |
| WorkBuddy | 见其「技能」设置页提示的目录 |

技能的作用：让模型在用户说「打开模板图库」「浏览这个 skill 的模板」时调用插件，其余情况不调用。

## 使用

1. 在对话里让模型打开图库，例如「打开 xxx 的模板图库」；
2. 模型调用 `open_template_gallery`，返回形如 `http://127.0.0.1:54321/?token=...` 的链接；
3. 点开链接，在网页里按分类筛选、查看详情、勾选模板；
4. 点「复制模板名称」，把 `模板名 / 中文名` 粘回对话。

## 已知边界

- 网页只监听 `127.0.0.1`，随机端口，**空闲 5 分钟**会话失效；宿主进程结束网页同时失效，需重新唤起。
- 同一时刻只有一个活跃会话，再次唤起会使旧链接失效。
- 链接含一次性 token，**不要转发给他人**。
- 图片来自模板 Skill 引用的官方在线示例，首次浏览需联网，之后走本地缓存。

## 排查

| 现象 | 处理 |
|---|---|
| 工具返回「未找到该名称的 Skill」 | 用 `skillName` 前先调 `list_template_skills` 看实际名称 |
| 工具返回「允许的 Skill 目录均不存在」 | 检查 `VTG_SKILL_ROOTS` 路径是否存在 |
| 工具返回「不在允许的 Skill 目录内」 | 目标 Skill 需位于 `VTG_SKILL_ROOTS` 之下 |
| 链接打不开 | 宿主进程可能已退出，重新唤起一次图库 |
