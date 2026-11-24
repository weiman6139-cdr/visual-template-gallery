export type TemplateConfidence = "high" | "medium" | "low";

export interface Template {
  id: string;
  name: string;
  nameEn?: string;
  nameZh?: string;
  category: string;
  styles: string[];
  scenes: string[];
  tags: string[];
  coverPath?: string;
  exampleCases: string[];
  sourceUrl?: string;
  previewCandidates: string[];
  previewColors?: string[];
  promptGuidance: string;
  confidence: TemplateConfidence;
}

export interface ParseResult {
  templates: Template[];
  warnings: string[];
}
