import type { Template } from "../core/template-model.js";

export interface GalleryState {
  page: number;
  pageSize: number;
  query: string;
  category: string;
  selectedIds: Set<string>;
}

export function filterTemplates(templates: Template[], query: string, category: string): Template[] {
  const normalizedQuery = query.trim().toLowerCase();
  return templates.filter((template) => {
    const matchesCategory = !category || template.category === category;
    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;
    return [template.id, template.name, template.category, ...template.tags]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function pageItems(templates: Template[], state: Pick<GalleryState, "page" | "pageSize">): Template[] {
  const start = Math.max(0, state.page - 1) * state.pageSize;
  return templates.slice(start, start + state.pageSize);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function toggleSelection(selectedIds: Set<string>, id: string): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

