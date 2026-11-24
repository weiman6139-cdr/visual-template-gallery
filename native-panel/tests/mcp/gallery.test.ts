import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer as createNetServer } from "node:net";
import { transform } from "esbuild";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { APP_MIME, APP_URI, createGalleryMcpServer } from "../../src/mcp/server.js";
import { discoverSkills, GalleryService } from "../../src/mcp/gallery-service.js";

const roots: string[] = [];
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "gallery-mcp-")); roots.push(root);
  const skill = path.join(root, "skill"); await mkdir(skill);
  await writeFile(path.join(skill, "SKILL.md"), "---\nname: fixture\n---\n# Fixture\n");
  await writeFile(path.join(skill, "manifest.json"), JSON.stringify({ templates: [
    { id: "one", name: "One", previewCandidates: ["https://raw.githubusercontent.com/example/library/main/one.png", "https://cdn.jsdelivr.net/gh/example/library@main/one.png"], guidance: "Keep the layout" },
    { id: "two", name: "Two", preview: "https://raw.githubusercontent.com/example/library/main/two.png" },
  ] }));
  return { root, skill };
}
async function connect(service: GalleryService, diagPath?: string) {
  const server = createGalleryMcpServer({ service, diagPath });
  const [host, transport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-host", version: "1" }); clients.push(client);
  await Promise.all([server.connect(transport), client.connect(host)]);
  return client;
}

describe("MCP gallery", () => {
  it("advertises an App resource and returns every template through the real MCP protocol", async () => {
    const { root, skill } = await fixture();
    const client = await connect(new GalleryService(path.join(root, "cache")));
    const { tools } = await client.listTools();
    const openTool = tools.find((tool) => tool.name === "open_template_gallery");
    expect(openTool?._meta?.ui).toMatchObject({
      resourceUri: APP_URI,
    });
    expect(openTool?._meta).toMatchObject({
      "openai/outputTemplate": APP_URI,
      "openai/widgetAccessible": true,
    });
    expect(openTool?._meta?.["openai/ui"]).toEqual({ entrypoints: [{ type: "global" }, { type: "thread" }] });
    const appTool = tools.find((tool) => tool.name === "select_templates");
    expect(appTool?._meta?.ui).toMatchObject({ visibility: ["app"] });
    expect(appTool?._meta?.["openai/widgetAccessible"]).toBe(true);
    const galleryTool = tools.find((tool) => tool.name === "get_template_gallery");
    expect(galleryTool?._meta?.ui).toMatchObject({ visibility: ["app"] });
    const pollTool = tools.find((tool) => tool.name === "get_selected_templates");
    expect(pollTool?._meta?.ui).toMatchObject({ visibility: ["app"] });
    expect(pollTool?._meta?.["openai/widgetAccessible"]).toBe(true);
    expect(galleryTool?._meta?.["openai/widgetAccessible"]).toBe(true);
    const clearTool = tools.find((tool) => tool.name === "clear_template_context");
    expect(clearTool?._meta?.ui).toMatchObject({ visibility: ["model", "app"] });
    const resources = await client.listResources();
    expect(resources.resources[0]).toMatchObject({ uri: APP_URI, mimeType: APP_MIME });
    const app = await client.readResource({ uri: APP_URI });
    expect(app.contents[0]).toMatchObject({ mimeType: APP_MIME });
    // 资源只声明 CSP；显示模式改由宿主 hostContext 与 App 请求协商（见 0.2.10 说明）。
    expect(app.contents[0]._meta).toMatchObject({ ui: { csp: { resourceDomains: ["data:", "blob:"] } } });
    expect((app.contents[0]._meta as { ui: Record<string, unknown> }).ui).not.toHaveProperty("availableDisplayModes");
    expect("text" in app.contents[0] && app.contents[0].text).toContain('id="cards"');
    if ("text" in app.contents[0]) {
      const html = app.contents[0].text;
      expect(html).not.toContain("/* APP_SCRIPT */");
      // 版本只在 package.json 维护，构建时注入；此处只断言注入成功，不锁定压缩后的写法。
      const { version } = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
      expect(html).toContain('name:"visual-template-gallery"');
      expect(html).toContain(`"${version}"`);
      expect(html).toContain('requestDisplayMode({mode:"fullscreen"}');
      expect(html).toContain('availableDisplayModes?.includes("fullscreen")');
      expect(html).toContain('"report_app_state"');
      expect(html).toContain("vtg:last-inline-reset");
      const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
      expect(script).toBeTruthy();
      await transform(script!); // Verify the shipped HTML contains executable JavaScript.
    }
    const opened = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: path.join(skill, "SKILL.md") }, _meta: { "x-codex-turn-metadata": JSON.stringify({ thread_id: "a" }) } });
    expect(opened.structuredContent).toEqual({ status: "awaiting-selection", templateCount: 2 });
    expect(Buffer.byteLength(JSON.stringify(opened))).toBeLessThan(4096);
    const pointer = opened._meta?.gallery as { sessionId: string; templateCount: number };
    expect(pointer).toMatchObject({ templateCount: 2 });
    const loaded = await client.callTool({ name: "get_template_gallery", arguments: { sessionId: pointer.sessionId }, _meta: { threadId: "a" } });
    const gallery = (loaded.structuredContent as { gallery: { sessionId: string; templates: unknown[] } }).gallery;
    expect(gallery.sessionId).toBe(pointer.sessionId);
    expect(gallery).not.toHaveProperty("threadId");
    expect(gallery.templates).toHaveLength(2);
    const selected = await client.callTool({ name: "select_templates", arguments: { sessionId: pointer.sessionId, selectedIds: ["two", "one", "two"] }, _meta: { threadId: "a" } });
    expect(selected.structuredContent).toMatchObject({ context: { selectedTemplates: [{ id: "two" }, { id: "one" }] } });
    const consumed = await client.callTool({ name: "clear_template_context", arguments: {}, _meta: { threadId: "a" } });
    expect(consumed.structuredContent).toMatchObject({ sessionId: pointer.sessionId, context: { selectedTemplates: [] } });
    const afterConsume = await client.callTool({ name: "get_selected_templates", arguments: { sessionId: pointer.sessionId }, _meta: { threadId: "a" } });
    expect(afterConsume.structuredContent).toMatchObject({ context: { selectedTemplates: [] } });
    const foreign = await client.callTool({ name: "get_selected_templates", arguments: { sessionId: pointer.sessionId }, _meta: { threadId: "b" } });
    expect(foreign.isError).toBe(true);
    const invalid = await client.callTool({ name: "select_templates", arguments: { sessionId: pointer.sessionId, selectedIds: ["invalid"] }, _meta: { threadId: "a" } });
    expect(invalid.isError).toBe(true);
    const cleared = await client.callTool({ name: "select_templates", arguments: { sessionId: pointer.sessionId, selectedIds: [] }, _meta: { threadId: "a" } });
    expect(cleared.structuredContent).toMatchObject({ context: { selectedTemplates: [], instruction: expect.stringContaining("清空") } });
  });

  it("returns a local Skill picker when no Skill path is supplied", async () => {
    const { root } = await fixture();
    const client = await connect(new GalleryService(path.join(root, "cache")));
    const opened = await client.callTool({ name: "open_template_gallery", arguments: {} });

    expect(opened.structuredContent).toEqual({ status: "awaiting-selection", templateCount: 0 });
    expect(opened._meta?.gallery).toBeUndefined();
    expect(opened._meta?.skills).toEqual(expect.any(Array));
    expect((opened._meta?.skills as unknown[]).every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Record<string, unknown>;
      return typeof item.name === "string" && typeof item.skillPath === "string";
    })).toBe(true);
  });

  it("records host-mount diagnostics in a local file without touching gallery state", async () => {
    const { root } = await fixture();
    const diagPath = path.join(root, "diag", "app-diag.jsonl");
    const client = await connect(new GalleryService(path.join(root, "cache")), diagPath);
    const diagTool = (await client.listTools()).tools.find((tool) => tool.name === "report_app_state");
    expect(diagTool?._meta?.ui).toMatchObject({ visibility: ["app"] });
    const written = await client.callTool({ name: "report_app_state", arguments: { event: "connected", data: { displayMode: "inline", availableDisplayModes: ["inline"] } } });
    expect(written.structuredContent).toMatchObject({ logged: true, file: diagPath });
    const lines = (await readFile(diagPath, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "connected", data: { displayMode: "inline" } });
  });

  it("keeps the open result small while the App fetches all 563 templates", async () => {
    const { root, skill } = await fixture();
    const templates = Array.from({ length: 563 }, (_, index) => ({ id: `style-${index}`, name: `Style ${index}` }));
    await writeFile(path.join(skill, "manifest.json"), JSON.stringify({ templates }));
    const client = await connect(new GalleryService(path.join(root, "cache")));
    const opened = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill }, _meta: { threadId: "large-library" } });
    const pointer = opened._meta?.gallery as { sessionId: string; templateCount: number };
    expect(pointer).toMatchObject({ templateCount: 563 });
    expect("templates" in pointer).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(opened))).toBeLessThan(2048);
    const loaded = await client.callTool({ name: "get_template_gallery", arguments: { sessionId: pointer.sessionId }, _meta: { threadId: "large-library" } });
    expect((loaded.structuredContent as { gallery: { templates: unknown[] } }).gallery.templates).toHaveLength(563);
  });

  it("isolates views, rejects missing ownership metadata and invalid Skill paths", async () => {
    const { root, skill } = await fixture();
    const service = new GalleryService(path.join(root, "cache"));
    const first = await service.open(skill, "a"); const second = await service.open(skill, "a");
    service.select(first.sessionId, ["one"], "a");
    expect(service.context(second.sessionId, "a").selectedTemplates).toEqual([]);
    expect(() => service.context(first.sessionId)).toThrow("无法验证当前 Codex 对话");
    await expect(service.open(path.join(skill, "manifest.json"), "a")).rejects.toThrow("SKILL.md");
    await expect(service.open(root, "a")).rejects.toThrow();
    await expect(service.open(skill)).rejects.toThrow("不能创建未绑定的图库会话");
    expect((await discoverSkills([root])).map((entry) => entry.name)).toEqual(["fixture"]);
  });

  it("rejects foreign and missing ownership on every session tool without changing the owner's selection", async () => {
    const { root, skill } = await fixture();
    const client = await connect(new GalleryService(path.join(root, "cache")));
    const opened = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill }, _meta: { threadId: "owner" } });
    const sessionId = (opened._meta?.gallery as { sessionId: string }).sessionId;
    await client.callTool({ name: "select_templates", arguments: { sessionId, selectedIds: ["one"] }, _meta: { threadId: "owner" } });
    for (const meta of [{ threadId: "foreign" }, {}]) {
      for (const request of [
        { name: "get_template_gallery", arguments: { sessionId } },
        { name: "get_selected_templates", arguments: { sessionId } },
        { name: "select_templates", arguments: { sessionId, selectedIds: ["two"] } },
        { name: "get_template_preview", arguments: { sessionId, templateId: "one" } },
      ]) {
        const result = await client.callTool({ ...request, _meta: meta });
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([{ type: "text", text: "无法验证当前 Codex 对话，或图库会话属于其他对话" }]);
      }
    }
    const ownerGallery = await client.callTool({ name: "get_template_gallery", arguments: { sessionId }, _meta: { threadId: "owner" } });
    expect(ownerGallery.structuredContent).toMatchObject({ gallery: { sessionId, templates: [{ id: "one" }, { id: "two" }] } });
    const owner = await client.callTool({ name: "get_selected_templates", arguments: { sessionId }, _meta: { threadId: "owner" } });
    expect(owner.structuredContent).toMatchObject({ context: { selectedTemplates: [{ id: "one" }] } });
  });

  it("does not open a Skill gallery when Codex conversation identity is missing", async () => {
    const { root, skill } = await fixture();
    const client = await connect(new GalleryService(path.join(root, "cache")));
    const opened = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill } });
    expect(opened.isError).toBe(true);
    expect(opened.content).toEqual([{ type: "text", text: "无法确认当前 Codex 对话，不能创建未绑定的图库会话" }]);

    const picker = await client.callTool({ name: "open_template_gallery", arguments: {} });
    expect(picker.structuredContent).toEqual({ status: "awaiting-selection", templateCount: 0 });
  });

  it("invalidates the old view after restarting the self-contained MCP process", async () => {
    const { root, skill } = await fixture();
    const deployed = path.join(root, "plugin");
    await cp(path.resolve("plugins/visual-template-gallery"), deployed, { recursive: true });
    const start = async () => {
      const client = new Client({ name: "restart-test", version: "1" }); clients.push(client);
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(deployed, "server.mjs")], cwd: deployed, stderr: "pipe" }));
      return client;
    };
    const first = await start();
    const opened = await first.callTool({ name: "open_template_gallery", arguments: { skillPath: skill }, _meta: { threadId: "owner" } });
    const oldSessionId = (opened._meta?.gallery as { sessionId: string }).sessionId;
    await first.callTool({ name: "select_templates", arguments: { sessionId: oldSessionId, selectedIds: ["one"] }, _meta: { threadId: "owner" } });
    await first.close(); clients.splice(clients.indexOf(first), 1);
    const restarted = await start();
    const stale = await restarted.callTool({ name: "get_selected_templates", arguments: { sessionId: oldSessionId }, _meta: { threadId: "owner" } });
    expect(stale.isError).toBe(true);
    expect(stale.content).toEqual([{ type: "text", text: "图库会话不存在或插件已重启，请重新打开图库" }]);
    const fresh = await restarted.callTool({ name: "open_template_gallery", arguments: { skillPath: skill }, _meta: { threadId: "owner" } });
    const freshSessionId = (fresh._meta?.gallery as { sessionId: string }).sessionId;
    expect(freshSessionId).not.toBe(oldSessionId);
    const freshGallery = await restarted.callTool({ name: "get_template_gallery", arguments: { sessionId: freshSessionId }, _meta: { threadId: "owner" } });
    expect(freshGallery.structuredContent).toMatchObject({ gallery: { selectedIds: [] } });
  });

  it("falls back to the official CDN, shares in-flight downloads, and serves cached previews offline", async () => {
    const { root, skill } = await fixture();
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes("raw.githubusercontent.com")
      ? new Response("missing", { status: 404 })
      : new Response(Buffer.from("fixture image"), { headers: { "content-type": "image/png" } }));
    const service = new GalleryService(path.join(root, "cache"), fetcher);
    const gallery = await service.open(skill, "owner");
    const [one, duplicate] = await Promise.all([service.preview(gallery.sessionId, "one", "owner"), service.preview(gallery.sessionId, "one", "owner")]);
    expect(one).toEqual(duplicate); expect(one.sourceUrl).toContain("cdn.jsdelivr.net");
    expect(one.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockImplementation(async () => { throw new Error("offline"); });
    expect(await service.preview(gallery.sessionId, "one", "owner")).toEqual(one);
    await expect(service.preview(gallery.sessionId, "invalid", "owner")).rejects.toThrow("模板不存在");
  });

  it("starts the installed self-contained package outside the source tree", async () => {
    const { root, skill } = await fixture();
    const deployed = path.join(root, "plugin");
    await cp(path.resolve("plugins/visual-template-gallery"), deployed, { recursive: true });
    const client = new Client({ name: "package-test", version: "1" }); clients.push(client);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(deployed, "server.mjs")], cwd: deployed, stderr: "pipe" }));
    const unbound = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill } });
    expect(unbound.isError).toBe(true);
    expect(unbound.content).toEqual([{ type: "text", text: "无法确认当前 Codex 对话，不能创建未绑定的图库会话" }]);
    const result = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill }, _meta: { threadId: "package-test" } });
    expect(result.structuredContent).toMatchObject({ templateCount: 2 });
    const resource = (await client.readResource({ uri: APP_URI })).contents[0];
    expect("text" in resource && resource.text).toContain('id="cards"');
  });

  it("keeps the MCP entrypoint independent from the legacy HTTP port", async () => {
    const holder = createNetServer();
    await new Promise<void>((resolve, reject) => {
      holder.once("error", reject);
      holder.listen(0, "127.0.0.1", () => resolve());
    });
    const address = holder.address();
    if (!address || typeof address === "string") throw new Error("无法取得测试端口");
    const client = new Client({ name: "stdio-entrypoint-test", version: "1" }); clients.push(client);
    const deployed = path.resolve("plugins/visual-template-gallery");
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [path.join(deployed, "server.mjs")],
      cwd: deployed,
      env: { ...process.env, PORT: String(address.port) } as Record<string, string>,
      stderr: "pipe",
    }));
    const { tools } = await client.listTools();
    expect(tools.some((tool) => tool.name === "open_template_gallery")).toBe(true);
    await new Promise<void>((resolve) => holder.close(() => resolve()));
  });

  it("parses a low-format Markdown table through the installed package", async () => {
    const { root } = await fixture();
    const skill = path.join(root, "table-skill");
    await mkdir(skill);
    await writeFile(path.join(skill, "SKILL.md"), "---\nname: table-fixture\n---\n# Table fixture\n");
    await writeFile(path.join(skill, "templates.md"), `
| Name | Preview | Source |
| --- | --- | --- |
| Product Board | ![preview](images/product-board.png) | [GitHub](https://github.com/example/design/blob/main/README.md) |
`);
    const deployed = path.join(root, "table-plugin");
    await cp(path.resolve("plugins/visual-template-gallery"), deployed, { recursive: true });
    const client = new Client({ name: "table-package-test", version: "1" }); clients.push(client);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(deployed, "server.mjs")], cwd: deployed, stderr: "pipe" }));
    const result = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill }, _meta: { threadId: "table-package-test" } });
    expect(result.structuredContent).toMatchObject({ templateCount: 1 });
    const pointer = result._meta?.gallery as { sessionId: string };
    const loaded = await client.callTool({ name: "get_template_gallery", arguments: { sessionId: pointer.sessionId }, _meta: { threadId: "table-package-test" } });
    const gallery = (loaded.structuredContent as { gallery: { templates: Array<{ id: string; name: string; previewCandidates: string[] }> } }).gallery;
    expect(gallery).toMatchObject({ templates: [{ id: "product-board", name: "Product Board" }] });
    expect(gallery.templates[0].previewCandidates[0])
      .toBe("https://raw.githubusercontent.com/example/design/main/images/product-board.png");
  });
});
