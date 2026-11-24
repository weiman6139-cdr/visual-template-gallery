import { mkdtemp, mkdir, writeFile, rm, cp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createGalleryMcpServer } from "../../src/mcp/server.js";
import { allowedSkillRoots, discoverSkills, GalleryService } from "../../src/mcp/gallery-service.js";

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

async function connect(service: GalleryService) {
  const { server, http } = createGalleryMcpServer({ service });
  const [host, transport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-host", version: "1" }); clients.push(client);
  await Promise.all([server.connect(transport), client.connect(host)]);
  return { client, http };
}

describe("MCP gallery", () => {
  it("exposes only tools, without any MCP App resource or app-only metadata", async () => {
    const { root, skill } = await fixture();
    const { client } = await connect(new GalleryService(path.join(root, "cache"), undefined, [root]));
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["list_template_skills", "open_template_gallery"]);
    for (const tool of tools) expect(tool._meta?.ui).toBeUndefined();
    expect(toolNames(tools)).not.toContain("select_templates");
    const capabilities = client.getServerCapabilities();
    expect(capabilities?.resources).toBeUndefined();
    const opened = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill } });
    expect(opened.structuredContent).toMatchObject({ status: "ready", skillName: "skill", templateCount: 2 });
    expect(opened._meta?.gallery).toBeUndefined();
  });

  it("keeps the open result small when the Skill has many templates", async () => {
    const { root, skill } = await fixture();
    const templates = Array.from({ length: 563 }, (_, index) => ({ id: `style-${index}`, name: `Style ${index}` }));
    await writeFile(path.join(skill, "manifest.json"), JSON.stringify({ templates }));
    const { client } = await connect(new GalleryService(path.join(root, "cache"), undefined, [root]));
    const opened = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill } });
    expect(opened.structuredContent).toMatchObject({ status: "ready", templateCount: 563 });
    expect(Buffer.byteLength(JSON.stringify(opened))).toBeLessThan(2048);
  });

  it("resolves a Skill by name and reports candidates for disambiguation", async () => {
    const { root } = await fixture();
    const second = path.join(root, "second"); await mkdir(second);
    await writeFile(path.join(second, "SKILL.md"), "---\nname: second-fixture\n---\n# Second\n");
    await writeFile(path.join(second, "manifest.json"), JSON.stringify({ templates: [{ id: "three", name: "Three" }] }));
    const { client } = await connect(new GalleryService(path.join(root, "cache"), undefined, [root]));
    const listed = await client.callTool({ name: "list_template_skills", arguments: {} });
    const skills = (listed.structuredContent as { skills: Array<{ name: string }> }).skills;
    expect(skills.map((skill) => skill.name)).toEqual(["fixture", "second-fixture"]);

    const ambiguous = await client.callTool({ name: "open_template_gallery", arguments: {} });
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.content).toEqual([{ type: "text", text: "发现多个含模板的 Skill：fixture、second-fixture。请说出要用哪一个" }]);

    const byName = await client.callTool({ name: "open_template_gallery", arguments: { skillName: "fixture" } });
    expect(byName.structuredContent).toMatchObject({ status: "ready", skillName: "skill" });
  });

  it("hides template-less Skills and refuses to open an empty gallery", async () => {
    const { root, skill } = await fixture();
    const empty = path.join(root, "empty-skill"); await mkdir(empty);
    await writeFile(path.join(empty, "SKILL.md"), "---\nname: empty-fixture\n---\n# Empty\n");
    const { client } = await connect(new GalleryService(path.join(root, "cache"), undefined, [root]));
    const listed = await client.callTool({ name: "list_template_skills", arguments: {} });
    const names = (listed.structuredContent as { skills: Array<{ name: string }> }).skills.map((entry) => entry.name);
    expect(names).toEqual(["fixture"]);
    const opened = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: empty } });
    expect(opened.isError).toBe(true);
    expect(String((opened.content as Array<{ text: string }>)[0].text)).toContain("未解析到任何模板");
    expect((await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill } })).structuredContent)
      .toMatchObject({ status: "ready", templateCount: 2 });
  });

  it("rejects Skill paths outside the allowed roots and invalid inputs", async () => {
    const { root, skill } = await fixture();
    const service = new GalleryService(path.join(root, "cache"), undefined, [root]);
    await expect(service.open(path.join(skill, "manifest.json"))).rejects.toThrow("SKILL.md");
    await expect(service.open("/etc")).rejects.toThrow("该路径不在允许的 Skill 目录内，已拒绝访问");
    await expect(service.open(root)).rejects.toThrow();
    expect((await discoverSkills([root])).map((entry) => entry.name)).toEqual(["fixture"]);
  });

  it("falls back to the official CDN, shares in-flight downloads, and serves cached images offline", async () => {
    const { root, skill } = await fixture();
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes("raw.githubusercontent.com")
      ? new Response("missing", { status: 404 })
      : new Response(Buffer.from("fixture image"), { headers: { "content-type": "image/png" } }));
    const service = new GalleryService(path.join(root, "cache"), fetcher, [root]);
    const { templates } = await service.open(skill);
    const one = templates.find((template) => template.id === "one")!;
    const [first, duplicate] = await Promise.all([service.image(one), service.image(one)]);
    expect(first.sourceUrl).toContain("cdn.jsdelivr.net");
    expect(first.contentType).toBe("image/png");
    expect(first.bytes.toString()).toBe("fixture image");
    expect(duplicate).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockImplementation(async () => { throw new Error("offline"); });
    expect(await service.image(one)).toEqual(first);
    await expect(service.image({ ...one, previewCandidates: ["https://evil.example.com/a.png"] })).rejects.toThrow("官方示例图暂时无法获取");
  });

  it("does not register the open tool when the plugin is disabled", async () => {
    const { root } = await fixture();
    const { server } = createGalleryMcpServer({ service: new GalleryService(path.join(root, "cache"), undefined, [root]), disable: true });
    const [host, transport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "disabled-test", version: "1" }); clients.push(client);
    await Promise.all([server.connect(transport), client.connect(host)]);
    const { tools } = await client.listTools();
    expect(toolNames(tools)).toEqual(["list_template_skills"]);
  });

  it("starts the installed self-contained package outside the source tree", async () => {
    const { root, skill } = await fixture();
    const deployed = path.join(root, "plugin");
    await cp(path.resolve("plugins/visual-template-gallery"), deployed, { recursive: true });
    const client = new Client({ name: "package-test", version: "1" }); clients.push(client);
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [path.join(deployed, "server.mjs")],
      cwd: deployed,
      env: { ...process.env, VTG_SKILL_ROOTS: root } as Record<string, string>,
      stderr: "pipe",
    }));
    const result = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill } });
    expect(result.structuredContent).toMatchObject({ status: "ready", templateCount: 2 });
    const outside = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: "/etc" } });
    expect(outside.isError).toBe(true);
    expect(JSON.stringify(outside)).not.toContain("/etc/passwd");
  });

  it("keeps the stdio entrypoint free of any HTTP listener", async () => {
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
    expect(toolNames(tools)).toContain("open_template_gallery");
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
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [path.join(deployed, "server.mjs")],
      cwd: deployed,
      env: { ...process.env, VTG_SKILL_ROOTS: root } as Record<string, string>,
      stderr: "pipe",
    }));
    const result = await client.callTool({ name: "open_template_gallery", arguments: { skillPath: skill } });
    expect(result.structuredContent).toMatchObject({ status: "ready", templateCount: 1 });
    const service = new GalleryService(path.join(root, "cache"), undefined, [root]);
    const { templates } = await service.open(skill);
    expect(templates[0]).toMatchObject({ id: "product-board", name: "Product Board" });
    expect(templates[0].previewCandidates[0]).toBe("https://raw.githubusercontent.com/example/design/main/images/product-board.png");
  });
});

function toolNames(tools: Array<{ name: string }>) {
  return tools.map((tool) => tool.name).sort();
}

describe("allowed skill roots", () => {
  it("accepts both the platform delimiter and commas from config files", () => {
    const sep = path.delimiter;
    expect(allowedSkillRoots({ VTG_SKILL_ROOTS: `/a/skills${sep}/b/skills` })).toEqual(["/a/skills", "/b/skills"]);
    expect(allowedSkillRoots({ VTG_SKILL_ROOTS: "/a/skills,/b/skills" })).toEqual(["/a/skills", "/b/skills"]);
    expect(allowedSkillRoots({ VTG_SKILL_ROOTS: " /a/skills , /b/skills " })).toEqual(["/a/skills", "/b/skills"]);
  });

  it("falls back to the default directories when unset", () => {
    expect(allowedSkillRoots({})).toEqual([
      path.join(homedir(), ".codex", "skills"),
      path.join(homedir(), ".agents", "skills"),
    ]);
  });
});
