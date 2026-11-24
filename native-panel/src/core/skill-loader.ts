import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mergeParseResults, parseManifest, parseMarkdownStyleLibrary, parseTheme } from "./template-parser.js";
import { parseMarkdownGalleryCases } from "./parsers/markdown-style-library.js";
import { cacheKey } from "./github-assets.js";
import type { ParseResult } from "./template-model.js";

interface GithubContext {
  root: string;
  owner: string;
  repo: string;
  ref: string;
}

interface GithubRepositoryRef {
  owner: string;
  repo: string;
  ref: string;
}

const repositoryGalleryCache = new Map<string, { expiresAt: number; result: Promise<ParseResult[]> }>();
const repositoryGalleryDiskCache = path.join(os.homedir(), ".cache", "visual-template-gallery", "repositories");

interface GallerySnapshot {
  index?: string;
  parts: Record<string, string>;
}

async function readGallerySnapshot(key: string, root = repositoryGalleryDiskCache): Promise<GallerySnapshot> {
  try {
    const value = JSON.parse(await readFile(path.join(root, `${cacheKey(key)}.json`), "utf8")) as Partial<GallerySnapshot>;
    if (typeof value !== "object" || !value || typeof value.parts !== "object" || !value.parts) return { parts: {} };
    return { index: typeof value.index === "string" ? value.index : undefined, parts: value.parts as Record<string, string> };
  } catch {
    return { parts: {} };
  }
}

async function writeGallerySnapshot(key: string, snapshot: GallerySnapshot, root = repositoryGalleryDiskCache): Promise<void> {
  await mkdir(root, { recursive: true });
  const target = path.join(root, `${cacheKey(key)}.json`);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot), "utf8");
  await rename(temporary, target);
}

function parseGallerySnapshot(snapshot: GallerySnapshot, owner: string, repo: string, ref: string): ParseResult[] | undefined {
  if (!snapshot.index) return undefined;
  const parts = [...new Set([...snapshot.index.matchAll(/\]\((\.\/[^)\s]*gallery-part-[^/)]+\.md)(?:#[^)]*)?\)/gi)]
    .map((match) => match[1]))];
  if (!parts.length) return undefined;
  const parsed = parts.map((part) => {
    const relativePath = path.posix.normalize(path.posix.join("docs", part.slice(2)));
    const markdown = snapshot.parts[relativePath];
    if (!markdown) return undefined;
    const sourceUrl = `https://github.com/${owner}/${repo}/blob/${ref}/${relativePath}`;
    const result = parseMarkdownGalleryCases(markdown, { sourceUrlFallback: sourceUrl });
    return result.templates.length ? result : undefined;
  });
  return parsed.every((part): part is ParseResult => Boolean(part)) ? parsed : undefined;
}

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else if (/\.(md|markdown|json)$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function parseGithubRemote(remote: string): { owner: string; repo: string } | null {
  const match = remote.trim().match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function repositoryRef(value: unknown): GithubRepositoryRef | null {
  if (typeof value !== "string") return null;
  const match = value.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[#?].*)?$/i);
  return match ? { owner: match[1], repo: match[2], ref: "main" } : null;
}

async function fetchRepositoryGallery(files: string[], fetchImpl: typeof fetch, cacheRoot = repositoryGalleryDiskCache): Promise<ParseResult[]> {
  const packageFile = files.find((file) => path.basename(file) === "package.json");
  if (!packageFile) return [];
  try {
    const metadata = JSON.parse(await readFile(packageFile, "utf8")) as Record<string, unknown>;
    const repository = typeof metadata.repository === "string"
      ? repositoryRef(metadata.repository)
      : metadata.repository && typeof metadata.repository === "object"
        ? repositoryRef((metadata.repository as Record<string, unknown>).url)
        : null;
    if (!repository) return [];

    const cacheKey = `${repository.owner}/${repository.repo}@${repository.ref}`;
    const cached = repositoryGalleryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    // Custom fetchers in tests must remain isolated from the user's persistent cache.
    const persistent = fetchImpl === fetch || cacheRoot !== repositoryGalleryDiskCache;
    const snapshot = persistent ? await readGallerySnapshot(cacheKey, cacheRoot) : { parts: {} };
    const cachedGallery = persistent ? parseGallerySnapshot(snapshot, repository.owner, repository.repo, repository.ref) : undefined;
    let snapshotDirty = false;

    const base = `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${repository.ref}`;
    const requestText = async (rawUrl: string, cdnUrl: string, timeout: number) => {
      let lastError: unknown;
      for (const url of [rawUrl, cdnUrl]) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeout) });
            if (!response.ok) {
              lastError = new Error(`HTTP ${response.status}`);
              continue;
            }
            const text = await response.text();
            const expectedBytes = Number(response.headers.get("content-length") || 0);
            const contentEncoding = response.headers.get("content-encoding");
            if (!text.trim()) throw new Error("响应内容为空");
            if (expectedBytes > 0 && !contentEncoding && Buffer.byteLength(text) !== expectedBytes) {
              throw new Error(`响应内容不完整：收到 ${Buffer.byteLength(text)}，预期 ${expectedBytes} 字节`);
            }
            return text;
          } catch (error) {
            lastError = error;
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError || "远端请求失败"));
    };

    const result = (async (): Promise<ParseResult[]> => {
    let index: string;
    try {
      index = await requestText(`${base}/docs/gallery.md`, `https://cdn.jsdelivr.net/gh/${repository.owner}/${repository.repo}@${repository.ref}/docs/gallery.md`, 20000);
    } catch (error) {
      if (snapshot.index) index = snapshot.index;
      else return [{ templates: [], warnings: [`GitHub 画廊索引请求失败：${String(error)}`] }];
    }
    if (index !== snapshot.index) {
      snapshot.index = index;
      snapshotDirty = true;
    }
    const parts = [...new Set([...index.matchAll(/\]\((\.\/[^)\s]*gallery-part-[^/)]+\.md)(?:#[^)]*)?\)/gi)]
      .map((match) => match[1]))];
    if (!parts.length) return [];

    const parsedParts = await Promise.all(parts.map(async (part) => {
      const relativePath = path.posix.normalize(path.posix.join("docs", part.slice(2)));
      const sourceUrl = `https://github.com/${repository.owner}/${repository.repo}/blob/${repository.ref}/${relativePath}`;
      try {
        const markdown = await requestText(`${base}/${relativePath}`, `https://cdn.jsdelivr.net/gh/${repository.owner}/${repository.repo}@${repository.ref}/${relativePath}`, 45000);
        const parsed = parseMarkdownGalleryCases(markdown, { sourceUrlFallback: sourceUrl });
        if (!parsed.templates.length) throw new Error(`${relativePath} 没有解析出任何案例`);
        if (snapshot.parts[relativePath] !== markdown) {
          snapshot.parts[relativePath] = markdown;
          snapshotDirty = true;
        }
        return parsed;
      } catch (error) {
        const cachedMarkdown = snapshot.parts[relativePath];
        if (cachedMarkdown) {
          const cached = parseMarkdownGalleryCases(cachedMarkdown, { sourceUrlFallback: sourceUrl });
          if (cached.templates.length) {
            return {
              templates: cached.templates,
              warnings: [`GitHub 画廊分册暂时不可用，已使用最近成功缓存：${relativePath}`],
            };
          }
        }
        return { templates: [], warnings: [`GitHub 画廊分册读取失败：${relativePath} (${String(error)})`] };
      }
    }));
    if (persistent && snapshotDirty) {
      await writeGallerySnapshot(cacheKey, snapshot, cacheRoot).catch(() => undefined);
    }
    return parsedParts;
    })();
    // Share an in-flight request, but only retain a complete gallery. A transiently
    // failed volume must be retried on the next open instead of serving partial data.
    const safeResult = result.catch((error): ParseResult[] => [{
      templates: [], warnings: [`GitHub 画廊分册读取失败：${String(error)}`],
    }]);
    const settled = safeResult.then((parts) => {
      const complete = parts.length > 0 && parts.every((part) => part.templates.length > 0 && part.warnings.length === 0);
      if (complete) repositoryGalleryCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, result: Promise.resolve(parts) });
      else if (!cachedGallery) repositoryGalleryCache.delete(cacheKey);
      return parts;
    });
    if (cachedGallery) {
      // Serve a complete persistent snapshot immediately; refresh it without holding up the UI.
      repositoryGalleryCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, result: Promise.resolve(cachedGallery) });
      void settled;
      return cachedGallery;
    }
    repositoryGalleryCache.set(cacheKey, { expiresAt: Date.now() + 60_000, result: settled });
    return settled;
  } catch (error) {
    return [{ templates: [], warnings: [`无法检查 Skill 仓库的 GitHub 画廊：${String(error)}`] }];
  }
}

async function findGithubContext(startPath: string): Promise<GithubContext | null> {
  const info = await stat(startPath);
  let current = info.isDirectory() ? path.resolve(startPath) : path.dirname(path.resolve(startPath));
  while (true) {
    const gitPath = path.join(current, ".git");
    try {
      const gitInfo = await stat(gitPath);
      if (gitInfo.isDirectory()) {
        const config = await readFile(path.join(gitPath, "config"), "utf8");
        const originBlock = config.match(/\[remote\s+"origin"\]([\s\S]*?)(?=\n\[|$)/i)?.[1] || "";
        const remote = originBlock.match(/^\s*url\s*=\s*(.+)$/m)?.[1];
        const repository = remote ? parseGithubRemote(remote) : null;
        if (!repository) return null;
        const head = await readFile(path.join(gitPath, "HEAD"), "utf8").catch(() => "");
        const ref = head.match(/refs\/heads\/(.+)/)?.[1]?.trim() || "main";
        return { root: current, ...repository, ref };
      }
    } catch {
      // Continue searching parent directories.
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function sourceUrlForFile(filePath: string, context: GithubContext | null): string | undefined {
  if (!context) return undefined;
  const relativePath = path.relative(context.root, filePath).split(path.sep).join("/");
  return `https://github.com/${context.owner}/${context.repo}/blob/${context.ref}/${relativePath}`;
}

export async function loadSkillTemplates(skillPath: string, fetchImpl: typeof fetch = fetch, repositoryCacheRoot?: string): Promise<ParseResult & { skillPath: string }> {
  let absolutePath = path.resolve(skillPath);
  let info = await stat(absolutePath);
  // A Skill is commonly passed as its SKILL.md path by MCP callers. Load the
  // containing directory so local indexes and repository metadata are found.
  if (info.isFile() && path.basename(absolutePath) === "SKILL.md") {
    absolutePath = path.dirname(absolutePath);
    info = await stat(absolutePath);
  }
  const files = info.isDirectory() ? await walk(absolutePath) : [absolutePath];
  const githubContext = await findGithubContext(absolutePath);
  const manifests = files.filter((file) => path.basename(file) === "manifest.json");
  const themeFiles = files.filter((file) => path.basename(file) === "theme.json");
  const markdownFiles = files.filter((file) => /\.(md|markdown)$/i.test(file));
  const results: ParseResult[] = [];
  let skillHomepage: string | undefined;
  let skillCategory: string | undefined;

  const primaryManifest = manifests[0];
  if (primaryManifest) {
    try {
      const metadata = JSON.parse(await readFile(primaryManifest, "utf8")) as Record<string, unknown>;
      skillHomepage = typeof metadata.homepage === "string" ? metadata.homepage : undefined;
      skillCategory = typeof metadata.category === "string" ? metadata.category : undefined;
    } catch {
      // The normal manifest parse below reports malformed JSON when applicable.
    }
  }

  for (const manifest of manifests) {
    try {
      const json = JSON.parse(await readFile(manifest, "utf8")) as Record<string, unknown>;
      if (Array.isArray(json.templates)) {
        results.push(parseManifest(json, { sourceUrlFallback: sourceUrlForFile(manifest, githubContext) }));
      }
    } catch (error) {
      results.push({ templates: [], warnings: [`无法读取 ${manifest}: ${String(error)}`] });
    }
  }

  for (const theme of themeFiles) {
    try {
      results.push(parseTheme(JSON.parse(await readFile(theme, "utf8")), {
        sourceUrlFallback: sourceUrlForFile(theme, githubContext) || skillHomepage,
        categoryFallback: skillCategory,
      }));
    } catch (error) {
      results.push({ templates: [], warnings: [`无法读取 ${theme}: ${String(error)}`] });
    }
  }

  for (const markdown of markdownFiles.sort((a, b) => (a.includes("style-library") ? -1 : b.includes("style-library") ? 1 : a.localeCompare(b)))) {
    const result = parseMarkdownStyleLibrary(await readFile(markdown, "utf8"), { sourceUrlFallback: sourceUrlForFile(markdown, githubContext) });
    if (result.templates.length) results.push(result);
  }

  results.push(...await fetchRepositoryGallery(files, fetchImpl, repositoryCacheRoot));

  const merged = mergeParseResults(results);
  if (!merged.templates.length) merged.warnings.unshift("当前 Skill 没有可识别的模板");
  return { ...merged, skillPath: absolutePath };
}
