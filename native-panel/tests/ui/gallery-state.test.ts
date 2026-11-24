import { describe, expect, it } from "vitest";
import { filterTemplates, pageCount, pageItems, toggleSelection } from "../../src/ui/gallery-state.js";
import type { Template } from "../../src/core/template-model.js";

const templates = (count: number): Template[] => Array.from({ length: count }, (_, index) => ({
  id: `template-${index + 1}`,
  name: `Template ${index + 1}`,
  category: index % 2 ? "Poster" : "UI",
  styles: [],
  scenes: [],
  tags: [index % 2 ? "campaign" : "dashboard"],
  exampleCases: [],
  previewCandidates: [],
  promptGuidance: "",
  confidence: "medium",
}));

describe("gallery state", () => {
  it("keeps pagination stable and filters by category/query", () => {
    const all = templates(25);
    expect(pageCount(all.length, 12)).toBe(3);
    expect(pageItems(all, { page: 2, pageSize: 12 })).toHaveLength(12);
    expect(filterTemplates(all, "campaign", "Poster")).toHaveLength(12);
  });

  it("toggles selection without mutating the original set", () => {
    const original = new Set(["template-1"]);
    const next = toggleSelection(original, "template-2");
    expect([...original]).toEqual(["template-1"]);
    expect([...next]).toEqual(["template-1", "template-2"]);
    expect([...toggleSelection(next, "template-1")]).toEqual(["template-2"]);
  });
});

