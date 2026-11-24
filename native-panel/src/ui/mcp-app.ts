import { App } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Template } from "../core/template-model.js";
import type { TemplateReferenceContext } from "../mcp/gallery-service.js";
import { ContextSync } from "./context-sync.js";
import { modelContextUpdate, selectedTemplateIds } from "./context-update.js";
import { PLUGIN_VERSION } from "../version.js";
import { filterTemplates, pageCount, pageItems, toggleSelection } from "./gallery-state.js";

window.addEventListener("error", (event) => console.error(`[vtg] uncaught: ${event.message}`));
window.addEventListener("unhandledrejection", (event) => console.error(`[vtg] unhandled rejection: ${String(event.reason)}`));
const app = new App({ name: "visual-template-gallery", version: PLUGIN_VERSION }, { availableDisplayModes: ["inline", "fullscreen"] }, { autoResize: true });
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
interface Gallery { sessionId: string; skillPath: string; templates: Template[]; warnings: string[]; selectedIds: string[] }
let gallery: Gallery | undefined;
let selected: string[] = [];
let page = 1;
let opening = false;
let galleryLoadVersion = 0;
let syncing = false;
let selectionPollTimer: ReturnType<typeof setInterval> | undefined;
const pageSize = 12;
// Preview images are base64 data URLs; an unbounded map would keep every page the
// user ever visited (up to 12 MB per image) alive inside the sandbox.
const PREVIEW_CACHE_LIMIT = 50;
const previews = new Map<string, string>();
function cachedPreview(key: string) {
  const value = previews.get(key);
  if (value === undefined) return undefined;
  previews.delete(key); previews.set(key, value);   // refresh LRU position
  return value;
}
function cachePreview(key: string, value: string) {
  previews.delete(key); previews.set(key, value);
  while (previews.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previews.keys().next();
    if (oldest.done) break;
    previews.delete(oldest.value);
  }
}
const loading = new Map<string, Promise<string>>();
let activePreviews = 0;
const previewWaiters: Array<() => void> = [];
function notice(id: string, text: string, error = false) { const target = el(id); target.textContent = text; target.dataset.error = String(error); }
let expanding = false;
// 目标：发完指令后自动把面板呈现在右侧，用户不需要再点任何东西。
//
// 宿主的已知行为（2026-10-28/29 真机）：
//  1. inline 创建 → App 请求 fullscreen → 宿主新建 fullscreen 实例 → 右侧面板出现（成功路径）；
//  2. 一旦请求过 fullscreen，宿主会把该 App 的显示模式持久化，之后直接以
//     fullscreen/fullSurface 创建，跳过 inline，看起来像"没有面板"。
// 因此：若启动时已经处于 fullscreen，先请求回 inline 复位一次，再由 inline 实例请求
// fullscreen。复位每 10 分钟最多一次，避免实例之间来回抖动。
const RESET_INTERVAL_MS = 10 * 60 * 1000;
const RESET_KEY = "vtg:last-inline-reset";
const PRESENTED_KEY = "vtg:presented-at";
function readStamp(key: string) {
  try { return Number(sessionStorage.getItem(key) || 0); } catch { return 0; }
}
function writeStamp(key: string) {
  try { sessionStorage.setItem(key, String(Date.now())); } catch { /* storage may be blocked */ }
}

async function presentPanel() {
  if (expanding) return;
  const context = app.getHostContext();
  const modes = context?.availableDisplayModes ?? [];
  if (!modes.includes("fullscreen")) { void report("display-skipped", { reason: "no-fullscreen-mode", modes }); showDisplayMode(); return; }
  const now = Date.now();
  const presentedAt = readStamp(PRESENTED_KEY);
  const resetAt = readStamp(RESET_KEY);

  if (context?.displayMode === "fullscreen") {
    writeStamp(PRESENTED_KEY);
    // 已经是目标形态：无需再点，除非它其实没在右侧（由 boot 诊断记录容器尺寸供判断）。
    if (now - resetAt < RESET_INTERVAL_MS) return;
    writeStamp(RESET_KEY);
    expanding = true;
    void report("display-request", { mode: "inline", source: "normalize" });
    try {
      const result = await app.requestDisplayMode({ mode: "inline" }, { timeout: 8000 });
      void report("display-result", { mode: result.mode, source: "normalize" });
    } catch (error) {
      void report("display-error", { error: String(error), source: "normalize" });
    } finally { expanding = false; }
    return;
  }

  // inline：本次呈现流程里还没请求过 fullscreen，就主动把面板推到右侧。
  const recentlyPresented = presentedAt > resetAt && now - presentedAt < RESET_INTERVAL_MS;
  if (recentlyPresented) return;
  await expandGallery();
  writeStamp(PRESENTED_KEY);
}

function showDisplayMode() {
  const context = app.getHostContext();
  const expanded = context?.displayMode === "fullscreen";
  const supported = context?.availableDisplayModes?.includes("fullscreen");
  el<HTMLButtonElement>("expand").disabled = expanding || expanded || !supported;
  el("collapse").hidden = !expanded;
  notice("display-status", expanded ? "宿主已切换为展开显示。请核对是否位于右侧面板。" : supported ? "当前显示在对话内，可请求展开。" : "当前宿主未提供展开显示能力，右侧面板尚不可用。");
}
async function expandGallery() {
  if (expanding || app.getHostContext()?.displayMode === "fullscreen") return;
  if (!app.getHostContext()?.availableDisplayModes?.includes("fullscreen")) { void report("display-skipped", { reason: "no-fullscreen-mode", hostContext: app.getHostContext() }); showDisplayMode(); return; }
  expanding = true;
  el<HTMLButtonElement>("expand").disabled = true;
  notice("display-status", "正在请求宿主展开图库…");
  void report("display-request", { mode: "fullscreen", hostContext: app.getHostContext() });
  try {
    const result = await app.requestDisplayMode({ mode: "fullscreen" }, { timeout: 10000 });
    void report("display-result", { mode: result.mode });
    notice("display-status", result.mode === "fullscreen" ? "宿主已切换为展开显示。请核对是否位于右侧面板。" : "宿主仍保持对话内显示，右侧面板未打开。", result.mode !== "fullscreen");
  } catch (error) { void report("display-error", { error: String(error) }); notice("display-status", `展开失败：${String(error)}。右侧面板未打开。`, true); }
  finally {
    expanding = false;
    el<HTMLButtonElement>("expand").disabled = app.getHostContext()?.displayMode === "fullscreen";
  }
}
function resultData(result: CallToolResult): Record<string, unknown> {
  if (result.isError) throw new Error(result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n") || "插件调用失败");
  return result.structuredContent || {};
}
async function tool(name: string, args: Record<string, unknown>, timeout?: number) {
  return app.callServerTool({ name, arguments: args }, timeout ? { timeout, maxTotalTimeout: timeout + 30000 } : undefined);
}
// Mount diagnostics. Seeing this line in app-diag.jsonl proves the host created an
// App session; a missing file means the panel could never appear for that call.
async function report(event: string, data: Record<string, unknown> = {}) {
  try { await tool("report_app_state", { event, data }); } catch { /* 诊断失败不影响界面 */ }
}
const sync = new ContextSync(async (ids) => {
  if (!gallery) throw new Error("请先打开图库");
  if (!app.getHostCapabilities()?.updateModelContext) throw new Error("当前宿主未开放会话上下文同步。请检查宿主的 MCP Apps 支持；选择尚未同步。");
  const data = resultData(await tool("select_templates", { sessionId: gallery.sessionId, selectedIds: ids }));
  const context = data.context as TemplateReferenceContext;
  await app.updateModelContext(modelContextUpdate(context));
  return context;
}, (state, error) => {
  syncing = state === "pending";
  el<HTMLButtonElement>("open").disabled = opening || syncing;
  notice("sync", state === "pending" ? "正在同步选择…" : state === "failed" ? `未同步：${error}` : selected.length ? "已提交当前模板快照。请在对话框描述需求。" : "已提交空选集快照；宿主可能仍显示此前的历史内容。", state === "failed");
  el("retry-sync").hidden = state !== "failed";
});

function applyRemoteContext(data: Record<string, unknown>): boolean {
  if (!gallery) return false;
  const context = data.context;
  if (!context || typeof context !== "object") return false;
  const remoteIds = selectedTemplateIds(context);
  if (!remoteIds) return false;
  const sessionId = data.sessionId;
  if (typeof sessionId === "string" && sessionId !== gallery.sessionId) return false;
  if (remoteIds.length === selected.length && remoteIds.every((id, index) => id === selected[index])) return true;
  selected = remoteIds;
  renderSelection();
  void sync.update(selected);
  return true;
}

// 宿主会把新的工具结果广播给所有已打开的面板实例，旧实例的 MCP 进程不认识新会话，
// 于是显示"图库会话不存在"。这里用结果里的 skillPath 在本进程重新打开，让旧面板自愈。
function isStaleSession(error: unknown) {
  return /图库会话不存在|无法验证当前 Codex 对话|插件已重启/.test(error instanceof Error ? error.message : String(error));
}
let recovering = false;

async function adoptGallery(pointer: { sessionId: string; skillPath?: unknown }): Promise<Gallery> {
  const read = async (sessionId: string) =>
    resultData(await tool("get_template_gallery", { sessionId })).gallery as Gallery;
  try { return await read(pointer.sessionId); }
  catch (error) {
    if (!isStaleSession(error) || typeof pointer.skillPath !== "string" || recovering) throw error;
    recovering = true;
    void report("session-recover", { skillPath: pointer.skillPath });
    try {
      const reopened = resultData(await tool("open_template_gallery", { skillPath: pointer.skillPath }, 240000));
      const next = (reopened._meta as Record<string, unknown> | undefined)?.gallery as { sessionId?: unknown } | undefined;
      if (typeof next?.sessionId !== "string") throw new Error("重新打开图库失败，请手动输入 Skill 路径");
      return await read(next.sessionId);
    } finally { recovering = false; }
  }
}

async function receive(result: CallToolResult) {
  const data = resultData(result);
  void report("tool-result", { keys: Object.keys(data).slice(0, 6), hasGalleryPointer: Boolean((result._meta || {}).gallery), hasContext: Boolean(data.context) });
  // clear_template_context is a model-visible tool. Consume its result
  // immediately so the panel does not wait for the polling interval.
  if (applyRemoteContext(data)) return;
  const meta = result._meta || {};
  if (Array.isArray(meta.skills)) populateSkills(meta.skills as Array<{ name: string; skillPath: string }>);
  if (!meta.gallery) return;
  const pointer = meta.gallery as { sessionId?: unknown; skillPath?: unknown };
  if (typeof pointer.sessionId !== "string") throw new Error("图库会话标识缺失，请重新打开图库");
  if (pointer.sessionId === gallery?.sessionId) return;
  const loadVersion = ++galleryLoadVersion;
  const loaded = await adoptGallery(pointer as { sessionId: string; skillPath?: unknown });
  if (loadVersion !== galleryLoadVersion) return;
  if (!loaded || loaded.sessionId !== pointer.sessionId || !Array.isArray(loaded.templates)) throw new Error("图库数据无效，请重新打开图库");
  gallery = loaded;
  selected = [...gallery.selectedIds];
  page = 1;
  el<HTMLInputElement>("skill").value = gallery.skillPath;
  el<HTMLInputElement>("search").value = "";
  const category = el<HTMLSelectElement>("category");
  category.replaceChildren(new Option("全部分类", ""), ...[...new Set(gallery.templates.map((t) => t.category))].sort().map((name) => new Option(name, name)));
  el("gallery").hidden = false;
  el("warnings").textContent = gallery.warnings.join("；");
  notice("connection", `已打开 ${gallery.templates.length} 个模板`);
  render();
  startSelectionPolling();
  // Opening a gallery is a read-only action: the previous conversation reference is only
  // replaced when the user actually selects, removes or clears something.
}
function populateSkills(skills: Array<{ name: string; skillPath: string }>) { el("skills").replaceChildren(...skills.map((s) => new Option(s.name, s.skillPath))); }

// The model-side clear arrives through ontoolresult; this poll only compensates for
// a lost receipt, so it can be slow and must not run while the panel is hidden.
const SELECTION_POLL_MS = 5000;
function startSelectionPolling() {
  if (selectionPollTimer) clearInterval(selectionPollTimer);
  selectionPollTimer = setInterval(async () => {
    if (!gallery || syncing || document.hidden) return;
    try {
      const data = resultData(await tool("get_selected_templates", { sessionId: gallery.sessionId }));
      applyRemoteContext(data);
    } catch (error) {
      // 会话随 MCP 进程重启失效时，用已知 skillPath 重建，避免面板停在报错状态。
      if (isStaleSession(error) && gallery && !recovering) {
        try { await adoptGallery({ sessionId: gallery.sessionId, skillPath: gallery.skillPath }); }
        catch { /* 恢复失败留在下一轮重试 */ }
      }
    }
  }, SELECTION_POLL_MS);
}

async function preview(current: Gallery, id: string): Promise<string> {
  const key = `${current.sessionId}:${id}`;
  const cached = cachedPreview(key);
  if (cached !== undefined) return cached;
  if (loading.has(key)) return loading.get(key)!;
  const request = (async () => {
    if (activePreviews >= 3) await new Promise<void>((resolve) => previewWaiters.push(resolve));
    activePreviews++;
    try {
      const data = resultData(await tool("get_template_preview", { sessionId: current.sessionId, templateId: id }));
      if (typeof data.dataUrl !== "string" || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(data.dataUrl)) throw new Error("预览图格式无效");
      cachePreview(key, data.dataUrl);
      return data.dataUrl;
    } finally { activePreviews--; previewWaiters.shift()?.(); }
  })();
  loading.set(key, request);
  try { return await request; } finally { loading.delete(key); }
}
function safeSource(value?: string) { try { const url = new URL(value || ""); return url.protocol === "https:" && ["github.com", "raw.githubusercontent.com", "cdn.jsdelivr.net"].includes(url.hostname) ? url.href : undefined; } catch { return undefined; } }
function makeButton(text: string, click: () => void) { const button = document.createElement("button"); button.textContent = text; button.addEventListener("click", click); return button; }
function changeSelection(ids: string[]) { selected = ids; renderSelection(); void sync.update(ids); }
// Every selection change goes through the shared toggle helper so the panel and the
// unit tests exercise the same rule set.
function toggle(id: string) {
  const single = el<HTMLSelectElement>("mode").value === "single";
  if (single) { changeSelection(selected.includes(id) ? [] : [id]); return; }
  changeSelection([...toggleSelection(new Set(selected), id)]);
}
function renderSelection() {
  el("selected-count").textContent = `已选 ${selected.length} 个模板`;
  el("selected").replaceChildren(...selected.map((id) => {
    const button = makeButton(`${gallery?.templates.find((t) => t.id === id)?.name || id} ×`, () => changeSelection(selected.filter((value) => value !== id)));
    button.className = "chip"; button.setAttribute("aria-label", `移除模板 ${id}`); return button;
  }));
  for (const card of document.querySelectorAll<HTMLElement>(".card")) {
    const picked = selected.includes(card.dataset.id!);
    card.classList.toggle("selected", picked);
    const button = card.querySelector<HTMLButtonElement>(".pick")!;
    button.setAttribute("aria-pressed", String(picked)); button.textContent = picked ? "取消选择" : "加入选择";
  }
}
function render() {
  if (!gallery) return;
  const current = gallery;
  const filtered = filterTemplates(current.templates, el<HTMLInputElement>("search").value, el<HTMLSelectElement>("category").value);
  const pages = pageCount(filtered.length, pageSize); page = Math.min(pages, Math.max(1, page));
  el<HTMLInputElement>("page").value = String(page); el<HTMLInputElement>("page").max = String(pages);
  el("pages").textContent = `/ ${pages}`; el<HTMLButtonElement>("prev").disabled = page === 1; el<HTMLButtonElement>("next").disabled = page === pages;
  el("total").textContent = `全部 ${current.templates.length} 个 · 当前 ${filtered.length} 个`;
  const cards = el("cards"); cards.replaceChildren();
  if (!filtered.length) { const empty = document.createElement("p"); empty.textContent = "没有匹配的模板。可清除筛选或尝试其他 Skill。"; cards.append(empty); }
  for (const t of pageItems(filtered, { page, pageSize })) {
    const card = document.createElement("article"); card.className = "card"; card.dataset.id = t.id;
    const imageArea = document.createElement("div"); imageArea.className = "preview";
    const load = () => {
      imageArea.replaceChildren(); const pending = document.createElement("p"); pending.textContent = t.previewCandidates.length ? "正在加载官方示例…" : "暂无官方示例图"; imageArea.append(pending);
      if (!t.previewCandidates.length) return;
      void preview(current, t.id).then((url) => { const img = document.createElement("img"); img.src = url; img.alt = `${t.name} 官方示例`; imageArea.replaceChildren(img); }).catch(() => { pending.textContent = "官方示例图暂时不可用"; imageArea.append(makeButton("重试", load)); });
    };
    const info = document.createElement("div"); info.className = "card-info";
    const title = document.createElement("h2"); title.textContent = t.name;
    const id = document.createElement("div"); id.className = "template-id"; id.textContent = t.id;
    const tags = document.createElement("p"); tags.className = "muted"; tags.textContent = [t.category, ...t.tags].join(" · ");
    const controls = document.createElement("div"); controls.className = "card-controls";
    const pick = makeButton("加入选择", () => toggle(t.id)); pick.className = "pick";
    controls.append(pick, makeButton("详情", () => {
      el("detail-title").textContent = t.name; el("detail-guidance").textContent = t.promptGuidance || "此模板未附加提示词指导，使用官方示例作为视觉参考。";
      const img = el<HTMLImageElement>("detail-image"); img.removeAttribute("src"); img.hidden = true;
      if (t.previewCandidates.length) void preview(current, t.id).then((url) => { img.src = url; img.hidden = false; }).catch(() => {});
      const source = el<HTMLAnchorElement>("detail-source"); const url = safeSource(t.sourceUrl || t.previewCandidates[0]); source.hidden = !url; if (url) source.href = url;
      el<HTMLDialogElement>("detail").showModal();
    }));
    info.append(title, id, tags, controls); card.append(imageArea, info); cards.append(card); load();
  }
  renderSelection();
}
el("skill-form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (opening || syncing) return;
  opening = true; el<HTMLButtonElement>("open").disabled = true;
  try { receive(await tool("open_template_gallery", { skillPath: el<HTMLInputElement>("skill").value.trim() }, 240000)); }
  catch (error) { notice("connection", String(error), true); }
  finally { opening = false; el<HTMLButtonElement>("open").disabled = syncing; }
});
el("search").addEventListener("input", () => { page = 1; render(); });
el("category").addEventListener("change", () => { page = 1; render(); });
el("mode").addEventListener("change", () => { if (el<HTMLSelectElement>("mode").value === "single" && selected.length > 1) changeSelection(selected.slice(0, 1)); });
el("prev").addEventListener("click", () => { page--; render(); }); el("next").addEventListener("click", () => { page++; render(); });
el("page").addEventListener("change", () => { page = Number(el<HTMLInputElement>("page").value) || 1; render(); });
el("clear").addEventListener("click", () => changeSelection([])); el("retry-sync").addEventListener("click", () => void sync.update(selected));
el("close-detail").addEventListener("click", () => el<HTMLDialogElement>("detail").close());
el("expand").addEventListener("click", () => void expandGallery());
el("collapse").addEventListener("click", () => {
  void report("display-request", { mode: "inline", source: "collapse-button" });
  void app.requestDisplayMode({ mode: "inline" }, { timeout: 10000 })
    .then((result) => { void report("display-result", { mode: result.mode, source: "collapse-button" }); showDisplayMode(); })
    .catch((error) => { void report("display-error", { error: String(error), source: "collapse-button" }); showDisplayMode(); });
});
app.ontoolresult = (result) => { void receive(result).catch((error) => notice("connection", String(error), true)); };
app.onhostcontextchanged = (context) => {
  if (context.theme) document.documentElement.style.colorScheme = context.theme;
  if (context.displayMode || context.availableDisplayModes) {
    showDisplayMode();
    // The host may publish display capabilities after connect(). Retry once
    // they arrive, rate-limited so a new instance does not chain further mounts.
    if (context.displayMode !== "fullscreen" && context.availableDisplayModes?.includes("fullscreen")) void presentPanel();
  }
};
try {
  await app.connect(undefined, { timeout: 10000 });
  void report("connected", { hostContext: app.getHostContext(), hostCapabilities: app.getHostCapabilities() });
  void report("boot", { size: [window.innerWidth, window.innerHeight], hidden: document.hidden, visibility: document.visibilityState });
  showDisplayMode();
  void presentPanel();
  if (!gallery) notice("connection", "已连接。请选择模板 Skill。");
  // 宿主若以 fullscreen 复用旧视图创建实例，可能不会投递本次工具结果；此时面板是空壳。
  setTimeout(() => { if (!gallery) void report("no-tool-result", { displayMode: app.getHostContext()?.displayMode }); }, 8000);
  populateSkills(resultData(await tool("list_template_skills", {})).skills as Array<{ name: string; skillPath: string }>);
} catch (error) {
  // report_app_state 需要 ui/initialize 成功后才能调用；初始化失败时只能靠宿主
  // 捕获的 console 留痕（Codex 桌面把沙箱 console 写进 mcp_app_sandbox.console_message）。
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[vtg] connect failed: ${message}`);
  notice("connection", `无法连接 MCP App 宿主：${message}。请刷新插件后重试。`, true);
}
