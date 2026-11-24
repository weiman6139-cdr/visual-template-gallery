// Launch with tsx. Local HTTP is used solely for browser protocol verification.
import { createServer } from "node:http";
import { build } from "esbuild";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createGalleryMcpServer, APP_URI } from "../src/mcp/server.ts";
const skillPath = process.argv[2] || "/Users/wxd/.codex/skills/gpt-image-2-style-library";
const client = new Client({ name: "browser-test", version: "1" });
const [host, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([client.connect(host), createGalleryMcpServer().connect(serverTransport)]);
const call = (params) => client.callTool({ ...params, _meta: { threadId: "protocol-test-thread" } });
const bundle = await build({ entryPoints: ["tests/fixtures/mcp-app-host.mjs"], bundle: true, platform: "browser", format: "esm", write: false });
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>MCP App 协议测试宿主</title>
<style>body{font:14px system-ui;margin:16px;background:#eee}iframe{width:440px;height:900px;border:1px solid #aaa;background:white}pre{white-space:pre-wrap}main{display:flex;gap:20px}aside{max-width:480px}</style>
<h1>协议测试宿主（不是 Codex）</h1><button id="reject">下一次同步拒绝</button><button id="slow">模拟慢同步</button>
<main><iframe id="app" title="模板插件面板"></iframe><aside><h2>宿主收到的参考上下文</h2><pre id="context"></pre></aside></main><script type="module" src="/host.js"></script></html>`;
const server = createServer(async (req, res) => {
  try {
    const route = new URL(req.url, "http://127.0.0.1").pathname;
    if (route === "/host.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle.outputFiles[0].text); }
    else if (route === "/app") { const result = await client.readResource({ uri: APP_URI }); res.setHeader("content-type", "text/html"); res.end(result.contents[0].text); }
    else if (route === "/initial") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(await call({ name: "open_template_gallery", arguments: { skillPath } }))); }
    else if (route === "/tool" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify(await call(JSON.parse(body))));
    } else { res.setHeader("content-type", "text/html"); res.end(html); }
  } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
server.listen(4180, "127.0.0.1", () => console.log("协议测试宿主：http://127.0.0.1:4180（不属于产品默认入口）"));
process.on("SIGINT", async () => { server.close(); await client.close(); process.exit(0); });
