import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { cacheKey } from "./github-assets.js";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export interface CachedAsset {
  path: string;
  contentType: string;
}

export interface AssetCacheOptions {
  root: string;
  fetchImpl?: typeof fetch;
}

export class AssetCache {
  private readonly pending = new Map<string, Promise<CachedAsset>>();
  private readonly root: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AssetCacheOptions) {
    this.root = options.root;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async get(url: string): Promise<CachedAsset> {
    const active = this.pending.get(url);
    if (active) return active;
    const request = this.load(url);
    this.pending.set(url, request);
    try { return await request; }
    finally { this.pending.delete(url); }
  }

  private async load(url: string): Promise<CachedAsset> {
    const key = cacheKey(url);
    const metadataPath = path.join(this.root, `${key}.json`);
    const imagePath = path.join(this.root, `${key}.asset`);
    await mkdir(this.root, { recursive: true });

    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as { contentType?: string };
      await stat(imagePath);
      return { path: imagePath, contentType: metadata.contentType ?? "application/octet-stream" };
    } catch {
      // Cache miss; continue to download.
    }

    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(45_000) });
    if (!response.ok || !response.body) throw new Error(`图片请求失败：${response.status} ${response.statusText}`);
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.startsWith("image/")) throw new Error(`远程资源不是图片：${contentType}`);

    const tempPath = `${imagePath}.tmp`;
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) throw new Error("图片超过 12MB 限制");
    await pipeline(response.body, createWriteStream(tempPath));
    const downloaded = await stat(tempPath);
    if (downloaded.size > MAX_IMAGE_BYTES) throw new Error("图片超过 12MB 限制");
    const { rename, writeFile } = await import("node:fs/promises");
    await rename(tempPath, imagePath);
    await writeFile(metadataPath, JSON.stringify({ contentType }), "utf8");
    return { path: imagePath, contentType };
  }
}
