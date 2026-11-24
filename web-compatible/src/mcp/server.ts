import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GalleryHttpServer } from "../http/server.js";
import { allowedSkillRoots, GalleryService } from "./gallery-service.js";

const OPEN_TOOL = "open_template_gallery";
const SKILL_PICKER_TOOL = "list_template_skills";

const INSTRUCTIONS = [
  "只读模板图库工具：解析目标 Skill 的模板并在本地启动网页图库，返回窗口期链接。",
  "用户明确要求浏览/查看模板图库时才调用 open_template_gallery。",
  "用户只是提到某个模板名称、或直接要求生成图片时不要调用；此时按该 Skill 自身规则工作。",
].join(" ");

interface GalleryMcpOptions {
  service?: GalleryService;
  disable?: boolean;
  idleTimeoutMs?: number;
}

export function createGalleryMcpServer(options: GalleryMcpOptions = {}) {
  const service = options.service || new GalleryService();
  const disabled = options.disable ?? process.env.VTG_DISABLE === "1";
  const http = new GalleryHttpServer(service, { idleTimeoutMs: options.idleTimeoutMs });
  const server = new McpServer(
    { name: "visual-template-gallery", title: "可视化模板图库", version: "0.3.0" },
    { instructions: INSTRUCTIONS },
  );

  if (!disabled) {
    server.registerTool(OPEN_TOOL, {
      title: "打开模板图库",
      description: "在本地启动只读网页图库，列出目标 Skill 的全部模板与官方示例图，用户挑选后复制模板名称回对话。当用户说打开/查看模板图库、或在指定模板 Skill 后要求浏览模板时调用。用户只是提到某个模板名称、或直接要求生成图片时不要调用。参数规则：不知道 Skill 名称时先调 list_template_skills，禁止凭上下文猜测 skillName 或 skillPath。若本次调用返回错误，请把错误原文转述给用户并等待指示：不要自行读取 Skill 资料、不要自己生成 HTML、不要用 file:// 页面或其他方式替代本工具。",
      inputSchema: {
        skillPath: z.string().min(1).optional().describe("Skill 目录或 SKILL.md 的绝对路径；须位于允许的 Skill 根目录内，不得猜测"),
        skillName: z.string().min(1).optional().describe("Skill 名称；必须来自 list_template_skills 返回的结果，不得猜测"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ skillPath, skillName }) => {
      try {
        const gallery = await service.open(await service.resolveSkill(skillPath, skillName));
        const { url, idleTimeoutMinutes } = await http.publish(gallery);
        return {
          content: [{
            type: "text",
            text: `图库已打开：${gallery.templates.length} 个模板。\n链接（空闲 ${idleTimeoutMinutes} 分钟后失效）：${url}\n浏览后点『复制模板名称』，回到对话粘贴名称即可。`,
          }],
          structuredContent: {
            status: "ready",
            skillName: path.basename(gallery.skillPath),
            templateCount: gallery.templates.length,
            url,
            idleTimeoutMinutes,
            warnings: gallery.warnings,
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: (error as Error).message }] };
      }
    });
  }

  server.registerTool(SKILL_PICKER_TOOL, {
    title: "列出模板 Skill",
    description: "列出允许目录下的本地 Skill，用于在 open_template_gallery 需要消歧时确定 Skill 名称。若返回空列表，说明允许目录配置有误，请如实转述，不要自行找替代方案。",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const skills = await service.listSkills();
    const text = skills.length
      ? `共 ${skills.length} 个含模板的 Skill：${skills.map((skill) => skill.name).join("、")}`
      : "未在允许的 Skill 目录中找到含模板的 Skill，请检查 VTG_SKILL_ROOTS 配置";
    return { content: [{ type: "text" as const, text }], structuredContent: { skills } };
  });

  return { server, http };
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  const printConfig = process.argv.includes("--print-config");
  if (printConfig) {
    const installDir = path.dirname(fileURLToPath(import.meta.url));
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            "visual-template-gallery": {
              command: process.execPath,
              args: [path.join(installDir, "server.mjs")],
              env: { VTG_SKILL_ROOTS: allowedSkillRoots().join(",") },
            },
          },
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const { server, http } = createGalleryMcpServer();
  const shutdown = () => { void http.close().then(() => process.exit(0)); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await server.connect(new StdioServerTransport());
}
