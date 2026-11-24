import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Template } from "../core/template-model.js";
import type { GalleryService, LoadedGallery } from "../mcp/gallery-service.js";
import { renderPage } from "./page.js";

export const SESSION_INVALID_MESSAGE = "图库会话已失效（空闲超时或宿主进程已结束），请重新唤起插件";
export const TOKEN_INVALID_MESSAGE = "令牌缺失或无效，请重新唤起插件";
export const IMAGE_UNAVAILABLE_MESSAGE = "官方示例图暂时无法获取，可查看来源链接或稍后重试";
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const PORT_ATTEMPTS = 3;

interface Session {
  token: string;
  skillPath: string;
  templates: Template[];
  lastActivityAt: number;
}

/** Single-session, read-only gallery server bound to 127.0.0.1. */
export class GalleryHttpServer {
  private readonly service: GalleryService;
  private readonly idleTimeoutMs: number;
  private server?: Server;
  private port = 0;
  private session?: Session;
  private sweeper?: NodeJS.Timeout;

  constructor(service: GalleryService, options: { idleTimeoutMs?: number } = {}) {
    this.service = service;
    this.idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  }

  /** Register a gallery as the single active session and return its one-time link. */
  async publish(gallery: LoadedGallery): Promise<{ url: string; idleTimeoutMinutes: number }> {
    await this.listen();
    this.session = {
      token: randomBytes(24).toString("hex"),
      skillPath: gallery.skillPath,
      templates: gallery.templates,
      lastActivityAt: Date.now(),
    };
    this.armSweeper();
    return { url: `http://127.0.0.1:${this.port}/?token=${this.session.token}`, idleTimeoutMinutes: Math.round(this.idleTimeoutMs / 60000) };
  }

  async close(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = undefined;
    this.session = undefined;
    const server = this.server;
    this.server = undefined;
    this.port = 0;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  get activePort(): number {
    return this.port;
  }

  private async listen(): Promise<void> {
    if (this.server) return;
    let lastError: unknown;
    for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt += 1) {
      const server = createServer((request, response) => { void this.handle(request, response); });
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
        });
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("无法取得监听端口");
        this.server = server;
        this.port = address.port;
        return;
      } catch (error) {
        lastError = error;
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
    throw new Error(`本地图库服务启动失败（端口尝试 ${PORT_ATTEMPTS} 次后仍不可用），请稍后重试；本次未生成任何链接${lastError ? "" : ""}`);
  }

  private armSweeper() {
    if (this.sweeper) clearInterval(this.sweeper);
    const interval = Math.max(250, Math.floor(this.idleTimeoutMs / 4));
    this.sweeper = setInterval(() => {
      if (!this.session) return;
      if (Date.now() - this.session.lastActivityAt < this.idleTimeoutMs) return;
      void this.close();
    }, interval);
    this.sweeper.unref?.();
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    try {
      if (!this.hostAllowed(request)) return this.fail(response, 403, "请求来源不被允许");
      if (!this.originAllowed(request)) return this.fail(response, 403, "请求来源不被允许");
      const url = new URL(request.url || "/", `http://127.0.0.1:${this.port}`);
      if (url.pathname === "/") return this.servePage(response, url.searchParams.get("token") || "");
      if (url.pathname === "/api/gallery") return await this.serveGallery(request, response);
      if (url.pathname.startsWith("/api/image/")) return await this.serveImage(response, url.pathname.slice("/api/image/".length), url.searchParams.get("t") || "");
      return this.fail(response, 404, "未找到该接口");
    } catch {
      return this.fail(response, 500, "服务处理请求时出错，请重新唤起插件");
    }
  }

  private hostAllowed(request: IncomingMessage): boolean {
    const host = request.headers.host;
    return host === `127.0.0.1:${this.port}`;
  }

  /** Same-origin GETs carry no Origin header; only a present Origin has to match. */
  private originAllowed(request: IncomingMessage): boolean {
    const origin = request.headers.origin;
    if (!origin) return true;
    return origin === `http://127.0.0.1:${this.port}`;
  }

  private touch() {
    if (this.session) this.session.lastActivityAt = Date.now();
  }

  private servePage(response: ServerResponse, token: string) {
    if (!this.session || token !== this.session.token) return this.fail(response, 401, SESSION_INVALID_MESSAGE);
    this.touch();
    const body = renderPage();
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(body);
  }

  private async serveGallery(request: IncomingMessage, response: ServerResponse) {
    const token = request.headers["x-vtg-token"];
    if (!this.session) return this.fail(response, 410, SESSION_INVALID_MESSAGE);
    if (typeof token !== "string" || token !== this.session.token) return this.fail(response, 401, TOKEN_INVALID_MESSAGE);
    this.touch();
    const { skillPath, templates } = this.session;
    const payload = {
      skillPath: skillPath.split(/[\\/]/).pop() || skillPath,
      templates,
    };
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify(payload));
  }

  private async serveImage(response: ServerResponse, rawTemplateId: string, token: string) {
    if (!this.session) return this.fail(response, 410, SESSION_INVALID_MESSAGE);
    if (token !== this.session.token) return this.fail(response, 401, TOKEN_INVALID_MESSAGE);
    const templateId = decodeURIComponent(rawTemplateId);
    // Scope every lookup to this session's own templates.
    const template = this.session.templates.find((entry) => entry.id === templateId);
    if (!template) return this.fail(response, 404, "模板不存在");
    this.touch();
    let image;
    try {
      image = await this.service.image(template);
    } catch {
      return this.fail(response, 502, IMAGE_UNAVAILABLE_MESSAGE);
    }
    response.writeHead(200, {
      "content-type": image.contentType,
      "content-length": image.bytes.byteLength,
      "cache-control": "private, max-age=86400",
    });
    response.end(image.bytes);
  }

  private fail(response: ServerResponse, status: number, message: string) {
    if (response.headersSent) return;
    response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ message }));
  }
}
