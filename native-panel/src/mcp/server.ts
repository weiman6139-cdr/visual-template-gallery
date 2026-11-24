import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { discoverSkills, GalleryService } from "./gallery-service.js";
import { PLUGIN_VERSION } from "../version.js";

export const APP_URI = "ui://visual-template-gallery/app.html";
export const APP_MIME = "text/html;profile=mcp-app";
export const openMeta = {
  // Keep the standard MCP Apps descriptor and Codex's thread/global entrypoints.
  // The latter is required by the desktop host to create an App session for a
  // model tool call; resource metadata alone only produces a plain MCP result.
  ui: { resourceUri: APP_URI, visibility: ["model", "app"] },
  "ui/resourceUri": APP_URI,
  "openai/outputTemplate": APP_URI,
  "openai/widgetAccessible": true,
  "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
};

function threadId(meta?: Record<string, unknown>): string | undefined {
  const value = meta?.["x-codex-turn-metadata"];
  let decoded: unknown = value;
  if (typeof value === "string") { try { decoded = JSON.parse(value); } catch { decoded = null; } }
  const nested = decoded && typeof decoded === "object" ? (decoded as Record<string, unknown>).thread_id : undefined;
  for (const candidate of [nested, meta?.["openai/threadId"], meta?.codexThreadId, meta?.threadId, meta?.thread_id]) {
    if (typeof candidate === "string" && candidate) return candidate;
  }
}

export const DEFAULT_DIAG_PATH = path.join(os.homedir(), ".cache", "visual-template-gallery", "app-diag.jsonl");
const DIAG_MAX_BYTES = 512 * 1024;

// Local-only diagnostics for the host-mount chain. A missing file means the App
// was never mounted; an entry means it mounted and reports what the host offered.
async function appendDiagnostic(file: string, entry: Record<string, unknown>) {
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const size = await stat(file).then((value) => value.size).catch(() => 0);
    if (size > DIAG_MAX_BYTES) return;
    await appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
  } catch {
    // Diagnostics must never break the gallery.
  }
}

interface GalleryMcpOptions {
  service?: GalleryService;
  appPath?: string;
  diagPath?: string;
}

export function createGalleryMcpServer(options: GalleryMcpOptions = {}) {
  const service = options.service || new GalleryService();
  const diagPath = options.diagPath || DEFAULT_DIAG_PATH;
  const deployedApp = fileURLToPath(new URL("./assets/app.html", import.meta.url));
  const appPath = options.appPath || (existsSync(deployedApp) ? deployedApp : fileURLToPath(new URL("../../plugins/visual-template-gallery/assets/app.html", import.meta.url)));
  const server = new McpServer({ name: "visual-template-gallery", title: "可视化模板图库", version: PLUGIN_VERSION }, {
    instructions: "When the user asks to browse templates or invokes a template Skill, call open_template_gallery with that Skill path. Show the entire library, never choose three recommendations by default. Selection is passive reference context for the user's next request; opening or selecting must not generate images. This server has no arbitrary Skill invocation event listener.",
  });
  // The host may read the resource several times per mount; the bundled HTML is
  // immutable for the process lifetime, so read it once and reuse the string.
  let appHtml: Promise<string> | undefined;
  const loadAppHtml = () => (appHtml ??= readFile(appPath, "utf8").catch((error) => { appHtml = undefined; throw error; }));
  server.registerResource("visual-template-gallery-app", APP_URI, { mimeType: APP_MIME, title: "可视化模板图库" }, async () => ({
    contents: [{ uri: APP_URI, mimeType: APP_MIME, text: await loadAppHtml(), _meta: { ui: {
      // 只声明 CSP。0.2.6 曾在此加 availableDisplayModes/preferredDisplayMode，
      // 但 2026-10-29 真机显示宿主会改成直接以 fullscreen/fullSurface 创建会话，
      // 且 App 初始化从未完成（无 session_opened、无 App 侧日志）。保留最小元数据。
      csp: { resourceDomains: ["data:", "blob:"], connectDomains: [] }, prefersBorder: false,
    } } }],
  }));
  server.registerTool("open_template_gallery", {
    title: "打开模板图库", description: "在 Codex MCP App 中展示目标 Skill 的全部模板。可传 Skill 目录或 SKILL.md；省略时显示本地 Skill 选择器。只浏览和选择，不生图。",
    inputSchema: { skillPath: z.string().min(1).optional() }, annotations: { readOnlyHint: true, openWorldHint: false }, _meta: openMeta,
  }, async ({ skillPath }, extra) => {
    const gallery = skillPath ? await service.open(skillPath, threadId(extra._meta)) : undefined;
    const text = gallery
      ? `图库已准备：${gallery.templates.length} 个模板。等待用户选择并描述任务。`
      : "请选择模板 Skill。";
    return {
      content: [{ type: "text", text }],
      structuredContent: { status: "awaiting-selection", templateCount: gallery?.templates.length || 0 },
      _meta: gallery ? { gallery: {
        sessionId: gallery.sessionId,
        skillPath: gallery.skillPath,
        templateCount: gallery.templates.length,
      } } : { skills: await discoverSkills() },
    };
  });
  const appMeta = {
    ui: { resourceUri: APP_URI, visibility: ["app"] },
    // The Codex widget bridge checks this alias before allowing iframe calls.
    "openai/widgetAccessible": true,
  };
  server.registerTool("report_app_state", {
    description: "仅由图库 App 调用的本机诊断写入：记录宿主是否挂载、显示模式协商结果与宿主能力。不返回用户数据，不改变图库或对话状态。",
    inputSchema: { event: z.string().min(1).max(120), data: z.record(z.string(), z.unknown()).optional() }, _meta: appMeta,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ event, data }) => {
    // 带上插件版本：可用来识别"宿主仍在跑旧版本子进程"这类回归。
    await appendDiagnostic(diagPath, { event, pluginVersion: PLUGIN_VERSION, data: data || {} });
    return { content: [], structuredContent: { logged: true, file: diagPath } };
  });
  server.registerTool("get_template_gallery", {
    description: "读取已打开图库的全部模板数据。仅供图库 App 加载，不向模型发送完整模板清单。",
    inputSchema: { sessionId: z.string().uuid() }, _meta: appMeta,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ sessionId }, extra) => ({
    content: [],
    structuredContent: { gallery: service.gallery(sessionId, threadId(extra._meta)) },
  }));
  server.registerTool("list_template_skills", {
    description: "列出本地 Skill 目录供用户选择，是否有模板由加载结果判断。", inputSchema: {}, _meta: appMeta,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => ({ content: [], structuredContent: { skills: await discoverSkills() } }));
  server.registerTool("select_templates", {
    description: "验证已选模板并构建被动视觉参考上下文；本工具不触发生成。",
    inputSchema: { sessionId: z.string().uuid(), selectedIds: z.array(z.string()).max(1000) }, _meta: appMeta,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ sessionId, selectedIds }, extra) => ({ content: [], structuredContent: { context: service.select(sessionId, selectedIds, threadId(extra._meta)) } }));
  server.registerTool("get_template_preview", {
    description: "读取已打开图库中的官方 GitHub 示例图，支持缓存和来源回退。",
    inputSchema: { sessionId: z.string().uuid(), templateId: z.string() }, _meta: appMeta,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ sessionId, templateId }, extra) => ({ content: [], structuredContent: await service.preview(sessionId, templateId, threadId(extra._meta)) }));
  server.registerTool("get_selected_templates", {
    description: "读取指定图库会话的模板引用，不声称已向 Codex 输入框插入注释。仅供图库 App 轮询，不对模型暴露。",
    inputSchema: { sessionId: z.string().uuid() }, _meta: appMeta, annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ sessionId }, extra) => {
    const context = service.context(sessionId, threadId(extra._meta));
    return { content: [{ type: "text", text: JSON.stringify(context) }], structuredContent: { context } };
  });
  server.registerTool("clear_template_context", {
    title: "清除已使用模板",
    description: "在完成依赖图库模板的生图或其他任务后，清除当前对话的模板选择和后续参考上下文。此工具不会发送用户消息或生成图片。",
    inputSchema: {}, _meta: { ui: { resourceUri: APP_URI, visibility: ["model", "app"] }, "openai/widgetAccessible": true },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (_args, extra) => {
    const cleared = service.clearLatest(threadId(extra._meta));
    return { content: [], structuredContent: { sessionId: cleared.sessionId, context: cleared.context } };
  });
  return server;
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  await createGalleryMcpServer().connect(new StdioServerTransport());
}
