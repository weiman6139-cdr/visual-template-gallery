import type { ParseResult, Template } from "../template-model.js";
import { resolveExampleCaseCandidates, resolveGithubAssetCandidates } from "../github-assets.js";

export interface MarkdownParseOptions {
  sourceUrlFallback?: string;
}

/**
 * The awesome-gpt-image-2 gallery is split into case blocks. Restricting this
 * parser to the explicit anchors avoids treating headings inside prompt code
 * fences as additional templates.
 */
export function parseMarkdownGalleryCases(markdown: string, options: MarkdownParseOptions = {}): ParseResult {
  const templates: Template[] = [];
  const warnings: string[] = [];
  const blocks = [...markdown.matchAll(/^#{2,6}\s+例\s*(\d+)\s*[：:]\s*(.+?)\s*$/gimu)];
  for (let index = 0; index < blocks.length; index += 1) {
    const match = blocks[index];
    const start = (match.index ?? 0) + match[0].length;
    const end = blocks[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(start, end);
    const image = section.match(/!\[((?:\\.|[^\]])*)\]\(([^)\s]+)(?:\s+[^)]*)?\)/);
    if (!image) {
      warnings.push(`案例 case-${match[1]} 缺少标题或示例图`);
      continue;
    }
    const name = stripMarkdown(match[2]);
    const previewCandidates = resolveGithubAssetCandidates(options.sourceUrlFallback, image[2]);
    if (!previewCandidates.length) {
      warnings.push(`案例 case-${match[1]} 没有解析出 GitHub 示例图`);
      continue;
    }
    templates.push({
      id: `case-${match[1]}`,
      name,
      category: "Gallery",
      styles: [],
      scenes: [],
      tags: [],
      exampleCases: [`case ${match[1]}`],
      sourceUrl: options.sourceUrlFallback,
      previewCandidates: [...new Set(previewCandidates)],
      promptGuidance: "",
      confidence: "high",
    });
  }
  return { templates, warnings };
}

function clean(value: string): string {
  return value.replace(/`/g, "").trim();
}

function listValue(section: string, label: string): string[] {
  const match = section.match(new RegExp(`^-\\s*${label}:\\s*(.+)$`, "m"));
  if (!match) return [];
  return clean(match[1])
    .split(/,|、/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function scalarValue(section: string, label: string): string | undefined {
  const match = section.match(new RegExp(`^-\\s*${label}:\\s*(.+)$`, "m"));
  return match ? clean(match[1]) : undefined;
}

function firstScalarValue(section: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const value = scalarValue(section, label);
    if (value) return value;
  }
  return undefined;
}

function guidanceValue(section: string): string {
  const match = section.match(/Guidance:\s*([\s\S]*?)(?:\n\s*Pitfalls:|$)/i);
  if (!match) return "";
  return match[1]
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .join(" ");
}

function splitNames(title: string): { name: string; nameEn?: string; nameZh?: string } {
  const [first, second] = title.split("/").map((value) => value.trim());
  if (!second) return { name: first };
  return { name: `${first} / ${second}`, nameEn: first, nameZh: second };
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "template";
}

function imageReferences(section: string): string[] {
  const references = [
    ...[...section.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)].map((match) => match[1]),
    ...[...section.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]),
  ];
  for (const label of ["Cover", "Preview", "Image", "Images", "Screenshot", "Reference", "Example image"]) {
    references.push(...listValue(section, label));
  }
  return [...new Set(references.map(clean).filter(Boolean))];
}

function tableCells(line: string): string[] {
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return value.split("|").map((cell) => clean(cell.replace(/\\\|/g, "|")));
}

function tableSeparator(line: string): boolean {
  return tableCells(line).length > 0 && tableCells(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function tableColumn(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header.replace(/`/g, "").trim().toLowerCase())));
}

function delimitedValues(value: string): string[] {
  return clean(value).replace(/<[^>]+>/g, "").split(/,|、/).map((item) => item.trim()).filter(Boolean);
}

function linkTarget(value: string): string {
  const markdownLink = value.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i)?.[1];
  const directUrl = value.match(/https?:\/\/[^\s|<>\])]+/i)?.[0];
  return clean(markdownLink || directUrl || value);
}

function tableCellImages(cell: string): string[] {
  return [
    ...[...cell.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)].map((match) => match[1]),
    ...[...cell.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]),
    ...[...cell.matchAll(/https?:\/\/[^\s|<>]+/g)].map((match) => match[0].replace(/[),.;]+$/, "")),
  ];
}

function stripMarkdown(value: string): string {
  return clean(value)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^[-*+]\s+/, "")
    .trim();
}

function parseMarkdownImageLines(markdown: string, options: MarkdownParseOptions, excludedIds: Set<string>): Template[] {
  const templates: Template[] = [];
  const usedIds = new Set(excludedIds);
  for (const line of markdown.split(/\r?\n/)) {
    const imageMatch = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+[^)]*)?\)/.exec(line);
    if (!imageMatch) continue;
    const idMatch = line.match(/(?:id|slug)\s*[:=]\s*`?([\p{L}\p{N}][\p{L}\p{N}_-]*)`?/iu) || line.match(/`([\p{L}\p{N}][\p{L}\p{N}_-]*)`/u);
    const alt = stripMarkdown(imageMatch[1]).replace(/\s+(preview|image|screenshot|reference|example|cover)$/i, "").trim();
    const prefix = stripMarkdown(line.slice(0, imageMatch.index)).replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*[:：|]\s*$/, "").trim();
    const name = prefix || alt;
    const id = idMatch?.[1] || (name ? slugify(name) : "");
    const explicitIdentity = Boolean(idMatch || prefix);
    if (!explicitIdentity && /\b(skill|logo|banner|badge|sponsor)\b/i.test(`${alt} ${imageMatch[2]}`)) continue;
    if (!name || !id || /^(preview|image|screenshot|reference|example|cover)$/i.test(name) || usedIds.has(id)) continue;
    const previewCandidates = resolveGithubAssetCandidates(options.sourceUrlFallback, imageMatch[2]);
    if (!previewCandidates.length) continue;
    usedIds.add(id);
    templates.push({
      id,
      name,
      category: "未分类",
      styles: [],
      scenes: [],
      tags: [],
      exampleCases: [],
      sourceUrl: options.sourceUrlFallback,
      previewCandidates: [...new Set(previewCandidates)],
      promptGuidance: "",
      confidence: "high",
    });
  }
  return templates;
}

function parseMarkdownTables(markdown: string, options: MarkdownParseOptions): Template[] {
  const lines = markdown.split(/\r?\n/);
  const templates: Template[] = [];
  const usedIds = new Set<string>();

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes("|") || !tableSeparator(lines[index + 1])) continue;
    const headers = tableCells(lines[index]).map((header) => header.toLowerCase());
    const idColumn = tableColumn(headers, [/^id$/, /template\s*id/, /slug/, /模板\s*id/, /标识/]);
    const nameColumn = tableColumn(headers, [/^name$/, /^title$/, /^template$/, /template\s*name/, /^模板$/, /名称/]);
    const imageColumn = tableColumn(headers, [/cover/, /preview/, /image/, /screenshot/, /reference/, /example/, /示例/, /图片/, /封面/]);
    if ((idColumn < 0 && nameColumn < 0) || imageColumn < 0) continue;

    const sourceColumn = tableColumn(headers, [/source/, /repository/, /github/, /来源/]);
    const categoryColumn = tableColumn(headers, [/category/, /分类/]);
    const tagsColumn = tableColumn(headers, [/tags?/, /标签/]);
    const guidanceColumn = tableColumn(headers, [/guidance/, /prompt/, /指导/, /提示词/]);
    for (index += 2; index < lines.length && lines[index].includes("|"); index += 1) {
      const cells = tableCells(lines[index]);
      const explicitId = idColumn >= 0 ? clean(cells[idColumn] || "").replace(/<[^>]+>/g, "") : "";
      const name = clean(cells[nameColumn] || explicitId || "").replace(/<[^>]+>/g, "");
      const id = explicitId || slugify(name);
      if (!id || !name || usedIds.has(id)) continue;
      const sourceUrl = sourceColumn >= 0 ? linkTarget(cells[sourceColumn] || "") : options.sourceUrlFallback;
      const references = tableCellImages(imageColumn >= 0 ? cells[imageColumn] || "" : "");
      const previewCandidates = references.flatMap((reference) => resolveGithubAssetCandidates(sourceUrl, reference));
      if (!previewCandidates.length) continue;
      usedIds.add(id);
      templates.push({
        id,
        name,
        category: categoryColumn >= 0 ? clean(cells[categoryColumn] || "未分类") : "未分类",
        styles: [],
        scenes: [],
        tags: tagsColumn >= 0 ? delimitedValues(cells[tagsColumn] || "") : [],
        exampleCases: [],
        sourceUrl,
        previewCandidates: [...new Set(previewCandidates)],
        promptGuidance: guidanceColumn >= 0 ? clean(cells[guidanceColumn] || "") : "",
        confidence: "high",
      });
    }
    index -= 1;
  }
  return templates;
}

function parseHtmlGalleryEntries(markdown: string): Template[] {
  const templates: Template[] = [];
  for (const match of markdown.matchAll(/<img\b([^>]+)>/gi)) {
    const attributes = match[1];
    const image = attributes.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const alt = attributes.match(/\balt=["']([^"']*)["']/i)?.[1] || "";
    const tail = markdown.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 700);
    const codeId = tail.match(/<code>\s*([^<]+?)\s*<\/code>/i)?.[1]?.trim();
    const altName = alt.replace(/\s+(preview|image|screenshot|reference|example|cover)\s*$/i, "").trim();
    const name = codeId || altName;
    const id = codeId || (altName ? slugify(altName) : "");
    if (!image || !id || !name) continue;
    templates.push({
      id,
      name,
      category: "未分类",
      styles: [],
      scenes: [],
      tags: [],
      exampleCases: [],
      previewCandidates: resolveGithubAssetCandidates(undefined, image),
      promptGuidance: alt,
      confidence: "high",
    });
  }
  return templates;
}

export function parseMarkdownStyleLibrary(markdown: string, options: MarkdownParseOptions = {}): ParseResult {
  const headings = [...markdown.matchAll(/^#{2,6}\s+(.+)$/gm)];
  const templates: Template[] = [...parseMarkdownTables(markdown, options), ...parseHtmlGalleryEntries(markdown)];
  const warnings: string[] = [];
  const usedIds = new Set<string>(templates.map((template) => template.id));

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(start, end);
    const title = heading[1].trim().replace(/\s+#.*$/, "");
    const explicitId = firstScalarValue(section, ["ID", "Id", "Template ID", "Slug"]);
    const explicitName = firstScalarValue(section, ["Name", "Title"]);
    const names = splitNames(explicitName || title);
    const baseId = explicitId || slugify(names.name);
    const id = usedIds.has(baseId) ? `${baseId}-${index + 1}` : baseId;
    const sourceUrl = firstScalarValue(section, ["Template source", "Source", "Repository", "GitHub"]) || options.sourceUrlFallback;
    const references = imageReferences(section);
    const coverPath = firstScalarValue(section, ["Cover", "Preview", "Image"]);
    const hasExampleCases = /\bcase\s*\d+/i.test(section);
    const htmlImageCount = (section.match(/<img\b/gi) || []).length;
    if (htmlImageCount > 0 && section.includes("<code>")) continue;

    const category = scalarValue(section, "Category") ?? "未分类";
    const styles = listValue(section, "Styles");
    const scenes = listValue(section, "Scenes");
    const tags = listValue(section, "Tags");
    const exampleCases = [...section.matchAll(/case\s*\d+/gi)].map((match) => match[0].toLowerCase().replace(/\s+/g, " "));
    const previewCandidates = [
      ...references.flatMap((reference) => resolveGithubAssetCandidates(sourceUrl, reference)),
      ...resolveGithubAssetCandidates(sourceUrl, coverPath),
      ...resolveExampleCaseCandidates(sourceUrl, exampleCases),
    ];

    if (!previewCandidates.length && !hasExampleCases) continue;
    usedIds.add(id);

    if (!previewCandidates.length) {
      warnings.push(`模板 ${id} 没有解析出 GitHub 示例图`);
    }

    templates.push({
      id,
      ...names,
      category,
      styles,
      scenes,
      tags,
      coverPath: coverPath || references[0],
      exampleCases: [...new Set(exampleCases)],
      sourceUrl,
      previewCandidates: [...new Set(previewCandidates)],
      promptGuidance: guidanceValue(section),
      confidence: previewCandidates.length ? "high" : "medium",
    });
  }

  templates.push(...parseMarkdownImageLines(markdown, options, new Set(templates.map((template) => template.id))));

  return { templates, warnings };
}
