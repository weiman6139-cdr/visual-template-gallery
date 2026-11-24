import { describe, expect, it } from "vitest";
import { modelContextUpdate, selectedTemplateIds } from "../../src/ui/context-update.js";
import { referenceContext } from "../../src/mcp/gallery-service.js";
import type { Template } from "../../src/core/template-model.js";

const template = (id: string): Template => ({
  id,
  name: `Template ${id}`,
  category: "Infographic",
  tags: ["education"],
  styles: [],
  scenes: [],
  exampleCases: [],
  promptGuidance: `Guidance ${id}`,
  previewCandidates: [`https://raw.githubusercontent.com/example/${id}.jpg`],
  confidence: "high",
});

describe("MCP model context update", () => {
  it("publishes one text block for each selected template and retains the full snapshot", () => {
    const context = referenceContext("/skills/demo", [template("one"), template("two")]);
    const update = modelContextUpdate(context);

    expect(update.content).toHaveLength(2);
    expect(update.content.map(({ text }) => text)).toEqual([
      expect.stringContaining("ID：one"),
      expect.stringContaining("ID：two"),
    ]);
    expect(update.structuredContent.selectedTemplates.map(({ id }) => id)).toEqual(["one", "two"]);
  });

  it("replaces selected template blocks with an explicit empty snapshot when cleared", () => {
    const update = modelContextUpdate(referenceContext("/skills/demo", []));

    expect(update.content).toEqual([]);
    expect(update.structuredContent.selectedTemplates).toEqual([]);
  });

  it("accepts only well-formed remote selection snapshots", () => {
    expect(selectedTemplateIds({ selectedTemplates: [{ id: "one" }, { id: "two" }] })).toEqual(["one", "two"]);
    expect(selectedTemplateIds({ selectedTemplates: [] })).toEqual([]);
    expect(selectedTemplateIds({ selectedTemplates: [{ name: "missing id" }] })).toBeUndefined();
    expect(selectedTemplateIds({ selectedTemplates: "not an array" })).toBeUndefined();
  });
});
