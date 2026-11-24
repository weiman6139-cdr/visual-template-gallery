import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetCache } from "../../src/core/cache.js";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

describe("AssetCache", () => {
  it("downloads an image once and serves the cached file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "visual-template-cache-"));
    roots.push(root);
    let requests = 0;
    const fetchImpl = vi.fn(async () => {
      requests += 1;
      if (requests > 1) throw new Error("offline");
      return new Response(Buffer.from("image-bytes"), { status: 200, headers: { "content-type": "image/jpeg" } });
    });
    const cache = new AssetCache({ root, fetchImpl });
    const first = await cache.get("https://raw.githubusercontent.com/a/b/main/image.jpg");
    const second = await cache.get("https://raw.githubusercontent.com/a/b/main/image.jpg");
    expect(first.path).toBe(second.path);
    expect(first.contentType).toBe("image/jpeg");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects failed requests and non-image responses", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "visual-template-cache-"));
    roots.push(root);
    const failed = new AssetCache({ root, fetchImpl: async () => new Response("missing", { status: 404 }) });
    await expect(failed.get("https://raw.githubusercontent.com/a/b/main/missing.jpg")).rejects.toThrow("图片请求失败");

    const text = new AssetCache({ root, fetchImpl: async () => new Response("not image", { status: 200, headers: { "content-type": "text/plain" } }) });
    await expect(text.get("https://raw.githubusercontent.com/a/b/main/readme")).rejects.toThrow("远程资源不是图片");
  });
});
