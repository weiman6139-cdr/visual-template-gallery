import type { ParseResult, Template } from "./template-model.js";
import { parseMarkdownStyleLibrary } from "./parsers/markdown-style-library.js";
import { resolveGithubAssetCandidates } from "./github-assets.js";

function toStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export interface ParseOptions {
  sourceUrlFallback?: string;
  categoryFallback?: string;
}

export function parseManifest(json: unknown, options: ParseOptions = {}): ParseResult {
  if (!json || typeof json !== "object" || !("templates" in json) || !Array.isArray(json.templates)) {
    return { templates: [], warnings: ["manifest.json 缺少 templates 数组"] };
  }

  const templates: Template[] = [];
  const warnings: string[] = [];
  for (const raw of json.templates) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!id && !name) {
      warnings.push("manifest 中存在缺少 id 和 name 的模板");
      continue;
    }
    const templateId = id || slugify(name);
    const templateName = name || id;
    const sourceUrl = typeof item.sourceUrl === "string" ? item.sourceUrl : options.sourceUrlFallback;
    const previewReferences = toStrings(item.previewCandidates ?? item.preview ?? item.cover ?? item.image ?? item.images);
    const previewCandidates = previewReferences.flatMap((reference) =>
      /^https?:\/\//i.test(reference) ? resolveGithubAssetCandidates(sourceUrl, reference) : resolveGithubAssetCandidates(sourceUrl, reference),
    );
    templates.push({
      id: templateId,
      name: templateName,
      category: typeof item.category === "string" ? item.category : "未分类",
      styles: toStrings(item.styles),
      scenes: toStrings(item.scenes),
      tags: toStrings(item.tags),
      exampleCases: toStrings(item.exampleCases),
      sourceUrl,
      previewCandidates: [...new Set(previewCandidates)],
      promptGuidance: typeof item.prompt === "string" ? item.prompt : typeof item.guidance === "string" ? item.guidance : "",
      confidence: previewCandidates.length ? "high" : "medium",
    });
  }
  return { templates, warnings };
}

export function parseTheme(json: unknown, options: ParseOptions = {}): ParseResult {
  if (!json || typeof json !== "object") return { templates: [], warnings: ["theme.json 不是 JSON 对象"] };
  const item = json as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const englishName = typeof item.name === "string" ? item.name.trim() : "";
  const chineseName = typeof item.nameZh === "string" ? item.nameZh.trim() : "";
  if (!id || (!englishName && !chineseName)) return { templates: [], warnings: ["theme.json 缺少 id 或 name"] };
  const preview = item.preview && typeof item.preview === "object" ? item.preview as Record<string, unknown> : {};
  const previewColors = Object.values(preview).filter((value): value is string => typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value));
  const name = englishName && chineseName ? `${englishName} / ${chineseName}` : englishName || chineseName;
  const description = typeof item.descriptionZh === "string" ? item.descriptionZh : typeof item.description === "string" ? item.description : "";
  const bestFor = toStrings(item.bestFor);
  const mood = toStrings(item.mood);
  return {
    templates: [{
      id,
      name,
      nameEn: englishName || undefined,
      nameZh: chineseName || undefined,
      category: options.categoryFallback || "Themes",
      styles: mood,
      scenes: bestFor,
      tags: mood,
      sourceUrl: options.sourceUrlFallback,
      previewCandidates: [],
      previewColors,
      exampleCases: [],
      promptGuidance: [description, bestFor.length ? `适用场景：${bestFor.join("、")}` : ""].filter(Boolean).join(" "),
      confidence: "low",
    }],
    warnings: [],
  };
}

export function mergeParseResults(results: ParseResult[]): ParseResult {
  const byId = new Map<string, Template>();
  const warnings = results.flatMap((result) => result.warnings);
  for (const result of results) {
    for (const template of result.templates) {
      const existing = byId.get(template.id);
      if (!existing) {
        byId.set(template.id, template);
        continue;
      }
      byId.set(template.id, {
        ...existing,
        name: existing.name.includes(" / ") ? existing.name : template.name,
        nameEn: existing.nameEn || template.nameEn,
        nameZh: existing.nameZh || template.nameZh,
        category: existing.category === "未分类" ? template.category : existing.category,
        styles: [...new Set([...existing.styles, ...template.styles])],
        scenes: [...new Set([...existing.scenes, ...template.scenes])],
        tags: [...new Set([...existing.tags, ...template.tags])],
        exampleCases: [...new Set([...existing.exampleCases, ...template.exampleCases])],
        sourceUrl: existing.sourceUrl || template.sourceUrl,
        previewCandidates: [...new Set([...existing.previewCandidates, ...template.previewCandidates])],
        previewColors: existing.previewColors?.length ? existing.previewColors : template.previewColors,
        promptGuidance: existing.promptGuidance || template.promptGuidance,
        confidence: existing.previewCandidates.length || template.previewCandidates.length ? "high" : existing.confidence,
      });
    }
  }
  return { templates: [...byId.values()], warnings };
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "template";
}

export { parseMarkdownStyleLibrary };
