import { describe, expect, it } from "vitest";
import { parseManifest, parseMarkdownStyleLibrary, parseTheme } from "../../src/core/template-parser.js";
import { parseMarkdownGalleryCases } from "../../src/core/parsers/markdown-style-library.js";

describe("parseMarkdownGalleryCases", () => {
  it("reads case headings without treating prompt headings as templates and accepts escaped image alt text", () => {
    const result = parseMarkdownGalleryCases(`
<a name="case-78"></a>
### 例 78：姿势分析图

![\\[CORE TASK\\] pose sheet](../data/images/case78.jpg)

\`\`\`text
### Character
make a character sheet
\`\`\`

### Character
not a gallery case
`, { sourceUrlFallback: "https://github.com/example/repo/blob/main/docs/gallery-part-1.md" });

    expect(result.warnings).toEqual([]);
    expect(result.templates).toMatchObject([{
      id: "case-78",
      name: "姿势分析图",
      previewCandidates: expect.arrayContaining(["https://raw.githubusercontent.com/example/repo/main/data/images/case78.jpg"]),
    }]);
  });
});

describe("parseMarkdownStyleLibrary", () => {
  it("parses template metadata and GitHub preview candidates", () => {
    const result = parseMarkdownStyleLibrary(`
### UI Screenshot System / UI 截图系统

- ID: \`ui-screenshot-system\`
- Category: UI & Interfaces
- Styles: UI, Dashboard
- Scenes: Tech, Social
- Tags: UI, Screenshot
- Cover: /images/case17.jpg
- Template source: https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/templates.md#tpl-ui
- Example cases: case 17, case 2

Guidance:
  - Lock layout and exact visible text.

Pitfalls:
  - Avoid vague platform names.
`);

    expect(result.warnings).toEqual([]);
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0]).toMatchObject({
      id: "ui-screenshot-system",
      nameEn: "UI Screenshot System",
      nameZh: "UI 截图系统",
      category: "UI & Interfaces",
      tags: ["UI", "Screenshot"],
      promptGuidance: "Lock layout and exact visible text.",
    });
    expect(result.templates[0].previewCandidates[0]).toContain("data/images/case17.jpg");
  });

  it("ignores ordinary headings without an ID", () => {
    const result = parseMarkdownStyleLibrary("### Intro\n\nNo template here.");
    expect(result.templates).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("accepts a named markdown section with only a GitHub image", () => {
    const result = parseMarkdownStyleLibrary(`
## Product Detail Board

![reference](https://raw.githubusercontent.com/example/design/main/templates/product-detail.png)
`, { sourceUrlFallback: "https://github.com/example/design/blob/main/README.md" });

    expect(result.warnings).toEqual([]);
    expect(result.templates).toMatchObject([{
      id: "product-detail-board",
      name: "Product Detail Board",
      previewCandidates: ["https://raw.githubusercontent.com/example/design/main/templates/product-detail.png"],
    }]);
  });

  it("accepts a manifest template with a name but no id", () => {
    const result = parseManifest({ templates: [{ name: "Editorial Grid", image: "https://raw.githubusercontent.com/example/design/main/editorial-grid.png" }] });

    expect(result.templates).toMatchObject([{
      id: "editorial-grid",
      name: "Editorial Grid",
      previewCandidates: ["https://raw.githubusercontent.com/example/design/main/editorial-grid.png"],
    }]);
  });

  it("parses a Markdown template table with an official image", () => {
    const result = parseMarkdownStyleLibrary(`
| ID | Name | Category | Preview | Source | Tags |
| --- | --- | --- | --- | --- | --- |
| product-board | Product Board / 产品板 | UI | ![preview](images/product-board.png) | [GitHub](https://github.com/example/design/blob/main/README.md) | UI, Product |
`);

    expect(result.warnings).toEqual([]);
    expect(result.templates).toMatchObject([{
      id: "product-board",
      name: "Product Board / 产品板",
      category: "UI",
      tags: ["UI", "Product"],
      sourceUrl: "https://github.com/example/design/blob/main/README.md",
    }]);
    expect(result.templates[0].previewCandidates[0]).toBe("https://raw.githubusercontent.com/example/design/main/images/product-board.png");
  });

  it("does not treat a local Skill example image as a GitHub template", () => {
    const result = parseMarkdownStyleLibrary(`
## Example Output

![local example](assets/example.png)
`);

    expect(result.templates).toHaveLength(0);
  });

  it("loads web-video theme JSON as a visual template with a palette preview", () => {
    const result = parseTheme({
      id: "blueprint",
      name: "Blueprint",
      nameZh: "蓝图",
      descriptionZh: "工程蓝图气质",
      bestFor: ["技术架构"],
      mood: ["dark", "technical"],
      preview: { shell: "#0a121f", accent: "#5fc7e8" },
    }, { categoryFallback: "Web Video / Presentation" });

    expect(result.templates[0]).toMatchObject({
      id: "blueprint",
      name: "Blueprint / 蓝图",
      category: "Web Video / Presentation",
      previewColors: ["#0a121f", "#5fc7e8"],
    });
  });

  it("extracts individual templates from an HTML image gallery", () => {
    const result = parseMarkdownStyleLibrary(`
### Dark themes
<a href="https://cdn.jsdelivr.net/gh/example/assets@main/dark.webp"><img src="https://cdn.jsdelivr.net/gh/example/assets@main/dark.webp" alt="dark preview" /></a>
<br /><strong><code>dark-theme</code></strong>
`);

    expect(result.templates).toMatchObject([{
      id: "dark-theme",
      previewCandidates: ["https://cdn.jsdelivr.net/gh/example/assets@main/dark.webp"],
    }]);
  });

  it("uses a descriptive HTML alt when the gallery has no code ID", () => {
    const result = parseMarkdownStyleLibrary(`
<img src="https://raw.githubusercontent.com/example/assets/main/product-board.png" alt="Product Board preview" />
`);

    expect(result.templates).toMatchObject([{
      id: "product-board",
      name: "Product Board",
      previewCandidates: ["https://raw.githubusercontent.com/example/assets/main/product-board.png"],
    }]);
  });

  it("parses a minimal Markdown image line with a name and ID", () => {
    const result = parseMarkdownStyleLibrary(`
- **Product Board** (\`product-board\`) ![preview](https://raw.githubusercontent.com/example/assets/main/product-board.png)
`);

    expect(result.templates).toMatchObject([{
      id: "product-board",
      name: "Product Board",
    }]);
  });

  it("ignores a Markdown image line with only a generic alt", () => {
    const result = parseMarkdownStyleLibrary(`
![preview](https://raw.githubusercontent.com/example/assets/main/product-board.png)
`);

    expect(result.templates).toHaveLength(0);
  });

  it("ignores a standalone Skill branding image without an explicit template identity", () => {
    const result = parseMarkdownStyleLibrary(`
![Web Video Presentation Skill](https://cdn.jsdelivr.net/gh/example/assets/main/web-video-presentation-skill.webp)
`);

    expect(result.templates).toHaveLength(0);
  });
});
