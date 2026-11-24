import { mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GalleryHttpServer } from "../../src/http/server.js";
import type { LoadedGallery } from "../../src/mcp/gallery-service.js";
import { GalleryService } from "../../src/mcp/gallery-service.js";

const roots: string[] = [];
const servers: GalleryHttpServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function templates() {
  return [
    { id: "one", name: "One", category: "UI", styles: [], scenes: [], tags: [], exampleCases: [], previewCandidates: ["https://raw.githubusercontent.com/example/library/main/one.png"], promptGuidance: "Keep the layout", confidence: "high" as const },
    { id: "two", name: "Two", category: "UI", styles: [], scenes: [], tags: [], exampleCases: [], previewCandidates: [], promptGuidance: "", confidence: "low" as const },
  ];
}

async function setup(idleTimeoutMs?: number) {
  const root = await mkdtemp(path.join(tmpdir(), "gallery-http-")); roots.push(root);
  const fetcher = vi.fn(async () => new Response(Buffer.from("png-bytes"), { headers: { "content-type": "image/png" } }));
  const service = new GalleryService(path.join(root, "cache"), fetcher, [root]);
  const http = new GalleryHttpServer(service, { idleTimeoutMs }); servers.push(http);
  const gallery: LoadedGallery = { skillPath: path.join(root, "skill"), templates: templates(), warnings: [] };
  const published = await http.publish(gallery);
  const port = http.activePort;
  const token = new URL(published.url).searchParams.get("token")!;
  return { http, port, token, fetcher, published };
}

function raw(port: number, pathname: string, headers: Record<string, string | number> = {}, method = "GET") {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: pathname, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("gallery http server", () => {
  it("serves the page for the active token and binds loopback only", async () => {
    const { port, token } = await setup();
    const page = await raw(port, `/?token=${token}`);
    expect(page.status).toBe(200);
    expect(String(page.headers["content-type"])).toContain("text/html");
    expect(page.body.toString()).toContain("模板图库");
    const wrong = await raw(port, "/?token=other");
    expect(wrong.status).toBe(401);
  });

  it("rejects requests whose Host or Origin is not the local origin", async () => {
    const { port, token } = await setup();
    const badHost = await raw(port, "/api/gallery", { host: "evil.example.com", "x-vtg-token": token });
    expect(badHost.status).toBe(403);
    const badOrigin = await raw(port, "/api/gallery", { host: `127.0.0.1:${port}`, origin: "http://evil.example.com", "x-vtg-token": token });
    expect(badOrigin.status).toBe(403);
  });

  it("requires the session token header on the gallery API", async () => {
    const { port, token } = await setup();
    expect((await raw(port, "/api/gallery")).status).toBe(401);
    const ok = await raw(port, "/api/gallery", { host: `127.0.0.1:${port}`, "x-vtg-token": token });
    expect(ok.status).toBe(200);
    const payload = JSON.parse(ok.body.toString());
    expect(payload.templates.map((entry: { id: string }) => entry.id)).toEqual(["one", "two"]);
  });

  it("streams cached images with content type and scopes template ids to the session", async () => {
    const { port, token, fetcher } = await setup();
    const image = await raw(port, `/api/image/one?t=${token}`);
    expect(image.status).toBe(200);
    expect(String(image.headers["content-type"])).toBe("image/png");
    expect(String(image.headers["cache-control"])).toContain("private");
    expect(image.body.toString()).toBe("png-bytes");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await raw(port, `/api/image/unknown?t=${token}`)).status).toBe(404);
    expect((await raw(port, "/api/image/one?t=wrong")).status).toBe(401);
  });

  it("replaces the previous session when the gallery is republished", async () => {
    const { http, port, token } = await setup();
    const again = await http.publish({ skillPath: "/tmp/skill", templates: templates(), warnings: [] });
    const nextToken = new URL(again.url).searchParams.get("token")!;
    expect(nextToken).not.toBe(token);
    const host = `127.0.0.1:${port}`;
    expect((await raw(port, "/api/gallery", { host, "x-vtg-token": token })).status).toBe(401);
    expect((await raw(port, "/api/gallery", { host, "x-vtg-token": nextToken })).status).toBe(200);
  });

  it("closes the session and the listener after the idle timeout", async () => {
    const { http, port, token } = await setup(300);
    const host = `127.0.0.1:${port}`;
    expect((await raw(port, "/api/gallery", { host, "x-vtg-token": token })).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(http.activePort).toBe(0);
    await expect(raw(port, "/api/gallery", { host, "x-vtg-token": token })).rejects.toThrow();
  });
});

describe("gallery page", () => {
  it("ships the browsing hooks and never inlines the token into markup", async () => {
    const { port, token } = await setup();
    const page = await raw(port, `/?token=${token}`);
    const html = page.body.toString();
    for (const hook of ['id="grid"', 'id="search"', 'id="category"', 'id="matches"', 'id="copy"', 'id="clear"', 'id="detail"', 'id="count"']) {
      expect(html).toContain(hook);
    }
    expect(html).not.toContain('id="chips"');
    expect(html).toContain("复制模板名称");
    expect(html).toContain("/api/image/");
    expect(html).toContain("history.replaceState");
    expect(html).not.toContain(token);
  });
});
