import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSkillTemplates } from "../../src/core/skill-loader.js";
import { cacheKey } from "../../src/core/github-assets.js";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

describe("skill loader", () => {
  it("loads a Skill when callers provide its SKILL.md path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-file-path-"));
    try {
      await writeFile(path.join(root, "SKILL.md"), "# Fixture\n");
      await writeFile(path.join(root, "manifest.json"), JSON.stringify({ templates: [{ id: "file-path", name: "File Path" }] }));
      const result = await loadSkillTemplates(path.join(root, "SKILL.md"));
      expect(result.templates.map(({ id }) => id)).toEqual(["file-path"]);
      expect(result.skillPath).toBe(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("does not count a Skill README branding image as a template", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "visual-template-branding-skill-"));
    roots.push(root);
    await writeFile(path.join(root, "SKILL.md"), "---\nname: branding\n---\n# Branding\n", "utf8");
    await writeFile(path.join(root, "README.md"), "![Example Skill](https://cdn.jsdelivr.net/gh/example/assets/main/example-skill.webp)\n", "utf8");
    const result = await loadSkillTemplates(root);
    expect(result.templates).toEqual([]);
    expect(result.warnings).toContain("当前 Skill 没有可识别的模板");
  });

  it("returns an explicit warning for a Skill without templates", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "visual-template-skill-"));
    roots.push(root);
    await writeFile(path.join(root, "README.md"), "# Ordinary Skill\n\nNo template index here.\n", "utf8");
    const result = await loadSkillTemplates(root);
    expect(result.templates).toEqual([]);
    expect(result.warnings).toContain("当前 Skill 没有可识别的模板");
  });

  it("infers GitHub image sources from a cloned Skill repository", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "visual-template-github-skill-"));
    roots.push(root);
    await mkdir(path.join(root, ".git"), { recursive: true });
    await writeFile(path.join(root, ".git", "config"), `[remote "origin"]\n\turl = https://github.com/example/template-skill.git\n`, "utf8");
    await writeFile(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
    await writeFile(path.join(root, "README.md"), "## Product Board\n\n![preview](assets/product-board.png)\n", "utf8");

    const result = await loadSkillTemplates(root);

    expect(result.warnings).toEqual([]);
    expect(result.templates[0]).toMatchObject({
      id: "product-board",
      sourceUrl: "https://github.com/example/template-skill/blob/main/README.md",
    });
    expect(result.templates[0].previewCandidates[0]).toBe("https://raw.githubusercontent.com/example/template-skill/main/assets/product-board.png");
  });

  it("discovers gallery volumes from a GitHub Skill package and loads every case", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "visual-template-gallery-repository-"));
    roots.push(root);
    await writeFile(path.join(root, "package.json"), JSON.stringify({
      repository: { type: "git", url: "git+https://github.com/example/gallery-skill.git", directory: "agents/skills/gallery-skill" },
    }), "utf8");
    await mkdir(path.join(root, "references"), { recursive: true });
    await writeFile(path.join(root, "references", "style-library.md"), "### Existing Style\n\n![style](https://raw.githubusercontent.com/example/gallery-skill/main/style.png)\n", "utf8");

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/docs/gallery.md")) {
        return new Response("- [Part 1](./gallery-part-1.md)\n- [Part 2](./gallery-part-2.md)\n", { status: 200 });
      }
      if (url.endsWith("/docs/gallery-part-1.md")) {
        return new Response('<a name="case-1"></a>\n### 例 1：First\n\n![first](../data/images/case1.jpg)', { status: 200 });
      }
      if (url.endsWith("/docs/gallery-part-2.md")) {
        return new Response('<a name="case-2"></a>\n### 例 2：Second\n\n![second](../data/images/case2.jpg)', { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const result = await loadSkillTemplates(root, fetchImpl);

    expect(result.warnings).toEqual([]);
    expect(result.templates.map(({ id }) => id)).toEqual(["existing-style", "case-1", "case-2"]);
    expect(result.templates.at(-1)).toMatchObject({
      id: "case-2",
      name: "Second",
      previewCandidates: expect.arrayContaining(["https://raw.githubusercontent.com/example/gallery-skill/main/data/images/case2.jpg"]),
    });
  });

  it("merges 22 local styles with both GitHub volumes into 563 unique templates", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "visual-template-full-gallery-"));
    roots.push(root);
    const repository = "https://github.com/example/full-gallery-fixture";
    await writeFile(path.join(root, "package.json"), JSON.stringify({ repository }), "utf8");
    await mkdir(path.join(root, "references"), { recursive: true });
    const localStyles = Array.from({ length: 22 }, (_, index) => {
      const number = index + 1;
      return `### Library Style ${number}\n\n- ID: library-style-${number}\n- Cover: https://raw.githubusercontent.com/example/full-gallery-fixture/main/images/style-${number}.jpg`;
    }).join("\n\n");
    await writeFile(path.join(root, "references", "style-library.md"), localStyles, "utf8");

    const cases = (numbers: number[]) => numbers.map((number) =>
      `### 例 ${number}：Case ${number}\n\n![Case ${number}](../data/images/case${number}.jpg)`,
    ).join("\n\n");
    const partOne = Array.from({ length: 165 }, (_, index) => index + 1).filter((number) => number !== 12);
    const partTwo = Array.from({ length: 379 }, (_, index) => index + 166).filter((number) => number !== 169 && number !== 170);
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/docs/gallery.md")) {
        return new Response("- [Part 1](./gallery-part-1.md)\n- [Part 2](./gallery-part-2.md)\n", { status: 200 });
      }
      if (url.endsWith("/docs/gallery-part-1.md")) return new Response(cases(partOne), { status: 200 });
      if (url.endsWith("/docs/gallery-part-2.md")) return new Response(cases(partTwo), { status: 200 });
      return new Response("not found", { status: 404 });
    };

    const result = await loadSkillTemplates(root, fetchImpl);
    const ids = result.templates.map(({ id }) => id);

    expect(result.warnings).toEqual([]);
    expect(result.templates).toHaveLength(563);
    expect(new Set(ids).size).toBe(563);
    expect(result.templates.filter(({ id }) => id.startsWith("case-"))).toHaveLength(541);
    expect(ids).toContain("case-544");
    expect(ids).not.toContain("case-12");
    expect(ids).not.toContain("case-169");
    expect(ids).not.toContain("case-170");
    expect(result.templates.find(({ id }) => id === "case-544")?.previewCandidates[0])
      .toBe("https://raw.githubusercontent.com/example/full-gallery-fixture/main/data/images/case544.jpg");
  });

  it("serves a complete cached gallery without waiting for a stalled network refresh", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "visual-template-gallery-stale-cache-"));
    roots.push(root);
    const cacheRoot = path.join(root, "cache");
    const repository = "https://github.com/example/stale-cache-skill";
    const repositoryKey = "example/stale-cache-skill@main";
    const index = "- [Part 1](./gallery-part-1.md)\n- [Part 2](./gallery-part-2.md)\n";
    const partOne = "### 例 1：First\n\n![first](../data/images/case1.jpg)";
    const partTwo = "### 例 2：Second\n\n![second](../data/images/case2.jpg)";
    await mkdir(cacheRoot, { recursive: true });
    await writeFile(path.join(root, "package.json"), JSON.stringify({ repository }), "utf8");
    await mkdir(path.join(root, "references"), { recursive: true });
    await writeFile(path.join(root, "references", "style-library.md"), "### Local Style\n\n- ID: local-style", "utf8");
    await writeFile(path.join(cacheRoot, `${cacheKey(repositoryKey)}.json`), JSON.stringify({
      index,
      parts: { "docs/gallery-part-1.md": partOne, "docs/gallery-part-2.md": partTwo },
    }), "utf8");

    let refreshStarted = false;
    const stalledFetch: typeof fetch = async () => {
      refreshStarted = true;
      return new Promise<Response>(() => {});
    };
    const result = await loadSkillTemplates(root, stalledFetch, cacheRoot);

    expect(refreshStarted).toBe(true);
    expect(result.templates.map(({ id }) => id)).toEqual(["case-1", "case-2"]);
    expect(result.warnings).toEqual([]);
  });

  it("does not cache a partial gallery after a remote volume fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "visual-template-gallery-retry-"));
    roots.push(root);
    await writeFile(path.join(root, "package.json"), JSON.stringify({ repository: "https://github.com/example/retry-gallery-skill.git" }), "utf8");
    let failPartTwo = true;
    let partTwoRequests = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/docs/gallery.md")) return new Response("- [Part 1](./gallery-part-1.md)\n- [Part 2](./gallery-part-2.md)");
      if (url.endsWith("/docs/gallery-part-1.md")) return new Response("### 例 1：First\n\n![first](../data/images/case1.jpg)");
      if (url.endsWith("/docs/gallery-part-2.md")) {
        partTwoRequests += 1;
        if (failPartTwo) return new Response("temporary failure", { status: 503 });
        return new Response("### 例 2：Second\n\n![second](../data/images/case2.jpg)");
      }
      return new Response("not found", { status: 404 });
    };

    const partial = await loadSkillTemplates(root, fetchImpl);
    expect(partial.templates.map(({ id }) => id)).toEqual(["case-1"]);
    expect(partial.warnings.some((warning) => warning.includes("分册读取失败"))).toBe(true);
    failPartTwo = false;
    const complete = await loadSkillTemplates(root, fetchImpl);
    expect(complete.warnings).toEqual([]);
    expect(complete.templates.map(({ id }) => id)).toEqual(["case-1", "case-2"]);
    expect(partTwoRequests).toBeGreaterThan(4);
  });
});
