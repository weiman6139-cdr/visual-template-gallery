import { readFile, readdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AssetCache } from "../core/cache.js";
import { loadSkillTemplates } from "../core/skill-loader.js";
import type { Template } from "../core/template-model.js";

export interface LoadedGallery {
  skillPath: string;
  templates: Template[];
  warnings: string[];
}

export interface LoadedImage {
  templateId: string;
  sourceUrl: string;
  contentType: string;
  bytes: Buffer;
}

const ALLOWED_IMAGE_HOSTS = /^https:\/\/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net)\//;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Allowed Skill roots: VTG_SKILL_ROOTS when set, otherwise the local defaults. Doubles as the path whitelist. */
export function allowedSkillRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  // Accept both the platform delimiter and commas: users habitually type commas in JSON configs.
  const configured = (env.VTG_SKILL_ROOTS || "")
    .split(new RegExp(`[${path.delimiter === ":" ? ":" : ";"},]`))
    .map((entry) => entry.trim())
    .filter(Boolean);
  const roots = configured.length
    ? configured
    : [path.join(os.homedir(), ".codex", "skills"), path.join(os.homedir(), ".agents", "skills")];
  return roots.map((root) => path.resolve(root));
}

async function realRoots(roots: string[]): Promise<string[]> {
  const resolved = await Promise.all(roots.map((root) => realpath(root).catch(() => undefined)));
  return resolved.filter((root): root is string => Boolean(root));
}

export function isInsideRoot(target: string, root: string): boolean {
  return target === root || target.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
}

export class GalleryService {
  private readonly cache: AssetCache;
  private readonly roots: string[];
  constructor(cacheRoot = path.join(os.homedir(), ".cache", "visual-template-gallery"), fetchImpl?: typeof fetch, roots = allowedSkillRoots()) {
    this.cache = new AssetCache({ root: cacheRoot, fetchImpl });
    this.roots = roots;
  }

  /** Skills visible in the allowed roots, used for picking and disambiguation. */
  listSkills() {
    return discoverSkills(this.roots);
  }

  /** Resolve the requested Skill: explicit path, then exact name, then the only candidate. */
  async resolveSkill(skillPath?: string, skillName?: string): Promise<string> {
    if (skillPath) return skillPath;
    const skills = await this.listSkills();
    if (skillName) {
      const matched = skills.find((skill) => skill.name === skillName);
      if (!matched) throw new Error("未找到该名称的 Skill，请确认名称或改用路径");
      return matched.skillPath;
    }
    if (skills.length === 1) return skills[0].skillPath;
    if (!skills.length) throw new Error("未在允许的 Skill 目录中找到可用的模板 Skill，请确认 VTG_SKILL_ROOTS 配置或指定 Skill 名称");
    throw new Error(`发现多个含模板的 Skill：${skills.map((skill) => skill.name).join("、")}。请说出要用哪一个`);
  }

  /** Resolve a Skill directory to its parsed templates. Paths outside the allowed roots are rejected. */
  async open(skillPath: string): Promise<LoadedGallery> {
    let resolved = await realpath(skillPath);
    if ((await stat(resolved)).isFile()) {
      if (path.basename(resolved) !== "SKILL.md") throw new Error("请提供 Skill 目录或 SKILL.md 路径");
      resolved = path.dirname(resolved);
    }
    // Whitelist first: never touch the filesystem below an unapproved root.
    const roots = await realRoots(this.roots);
    if (!roots.length) {
      throw new Error(`允许的 Skill 目录均不存在：${this.roots.join("、")}，请检查 VTG_SKILL_ROOTS 配置`);
    }
    if (!roots.some((root) => isInsideRoot(resolved, root))) {
      throw new Error(`该路径不在允许的 Skill 目录内，已拒绝访问。当前允许：${roots.join("、")}`);
    }
    await stat(path.join(resolved, "SKILL.md"));
    const loaded = await loadSkillTemplates(resolved);
    if (!loaded.templates.length) {
      throw new Error(`${path.basename(resolved)} 未解析到任何模板。请如实告知用户该 Skill 不含可浏览模板，不要自行读取其资料罗列模板，也不要用其他页面替代本工具。`);
    }
    return { ...loaded, skillPath: resolved };
  }

  /** Return the official example image for one template, preferring the local cache. */
  async image(template: Template): Promise<LoadedImage> {
    for (const url of template.previewCandidates) {
      if (!ALLOWED_IMAGE_HOSTS.test(url)) continue;
      try {
        const cached = await this.cache.get(url);
        const mime = cached.contentType.split(";")[0];
        if (!ALLOWED_IMAGE_TYPES.includes(mime)) continue;
        return { templateId: template.id, sourceUrl: url, contentType: mime, bytes: await readFile(cached.path) };
      } catch {
        // Try another official source; a card without an image stays readable.
      }
    }
    throw new Error("官方示例图暂时无法获取，可查看来源链接或稍后重试");
  }
}

export async function discoverSkills(roots = allowedSkillRoots()) {
  const candidates: Array<{ name: string; skillPath: string }> = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const skillPath = await realpath(path.join(root, entry.name)).catch(() => "");
      if (!skillPath || seen.has(skillPath)) continue;
      const text = await readFile(path.join(skillPath, "SKILL.md"), "utf8").catch(() => "");
      if (!text) continue;
      seen.add(skillPath);
      candidates.push({ name: text.match(/^name:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, "") || entry.name, skillPath });
    }
  }

  // Only Skills that actually parse to templates are offered for picking; the rest would
  // open an empty gallery and push the model to improvise. Parsing stays offline here.
  const offline = async () => { throw new Error("offline discovery"); };
  const found: Array<{ name: string; skillPath: string }> = [];
  const names = new Set<string>();
  let cursor = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      const count = await loadSkillTemplates(candidate.skillPath, offline).then((loaded) => loaded.templates.length).catch(() => 0);
      if (count > 0 && !names.has(candidate.name)) {
        names.add(candidate.name);
        found.push(candidate);
      }
    }
  }));

  return found.sort((a, b) => a.name.localeCompare(b.name));
}
