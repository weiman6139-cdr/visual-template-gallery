/** Gallery page shell: single-render grid, category filter, detail panel, copy-names action. */
export function renderPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>模板图库</title>
<style>
  :root { color-scheme: light dark; --line: #0000001a; --line-strong: #00000033; --muted: #666; --accent: #2f6fed; --bg: #fff; --panel: #f6f7f9; }
  @media (prefers-color-scheme: dark) { :root { --line: #ffffff1f; --line-strong: #ffffff33; --muted: #9aa0a6; --accent: #6d9bff; --bg: #17181a; --panel: #202124; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: inherit; font: 14px/1.55 system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif; }
  header { position: sticky; top: 0; z-index: 3; background: var(--bg); border-bottom: 1px solid var(--line); padding: 12px 20px 10px; }
  h1 { font-size: 16px; margin: 0 0 10px; display: flex; gap: 8px; align-items: baseline; }
  h1 small { font-weight: 400; color: var(--muted); font-size: 12px; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .toolbar input[type="search"] { flex: 1 1 220px; min-width: 150px; border: 1px solid var(--line-strong); background: transparent; color: inherit; border-radius: 8px; padding: 6px 10px; font-size: 13px; }
  .toolbar select { border: 1px solid var(--line-strong); background: transparent; color: inherit; border-radius: 8px; padding: 6px 10px; font-size: 13px; max-width: 240px; cursor: pointer; }
  .matches { color: var(--muted); font-size: 12px; }
  .empty { color: var(--muted); padding: 40px 0; text-align: center; }
  main { padding: 16px 20px 96px; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
  .card { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--panel); display: flex; flex-direction: column; }
  .card[data-selected="true"] { outline: 2px solid var(--accent); outline-offset: -2px; }
  .thumb { aspect-ratio: 4 / 3; width: 100%; background: var(--panel); display: block; border: 0; padding: 0; cursor: zoom-in; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .body { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 6px; }
  .name { font-size: 13px; line-height: 1.35; }
  .meta { font-size: 11px; color: var(--muted); }
  .row { display: flex; gap: 6px; align-items: center; margin-top: auto; }
  .select { flex: 1; border: 1px solid var(--line-strong); background: transparent; color: inherit; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer; }
  .card[data-selected="true"] .select { border-color: var(--accent); color: var(--accent); }
  footer { position: fixed; bottom: 0; left: 0; right: 0; z-index: 4; background: var(--bg); border-top: 1px solid var(--line); padding: 10px 20px; display: flex; gap: 10px; align-items: center; }
  footer .count { color: var(--muted); font-size: 12px; margin-right: auto; }
  button.action { border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: #fff; padding: 7px 14px; font-size: 13px; cursor: pointer; }
  button.ghost { border-radius: 8px; border: 1px solid var(--line-strong); background: transparent; color: inherit; padding: 7px 12px; font-size: 13px; cursor: pointer; }
  button[disabled] { opacity: .45; cursor: not-allowed; }
  .state { padding: 60px 20px; text-align: center; color: var(--muted); }
  dialog { border: 0; border-radius: 12px; padding: 0; max-width: min(880px, 92vw); width: 100%; background: var(--bg); color: inherit; }
  dialog::backdrop { background: #0009; }
  .detail { display: flex; flex-direction: column; gap: 12px; padding: 16px; max-height: 86vh; overflow: auto; }
  .detail img { width: 100%; height: auto; border-radius: 8px; background: var(--panel); }
  .detail h2 { font-size: 15px; margin: 0; }
  .detail dl { display: grid; grid-template-columns: 76px 1fr; gap: 6px 10px; margin: 0; font-size: 12.5px; }
  .detail dt { color: var(--muted); }
  .detail dd { margin: 0; word-break: break-word; }
  .detail pre { white-space: pre-wrap; margin: 0; font: inherit; font-size: 12.5px; background: var(--panel); padding: 10px; border-radius: 8px; }
  .toast { position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); background: #1f2937; color: #fff; padding: 8px 14px; border-radius: 8px; font-size: 12.5px; opacity: 0; transition: opacity .18s; pointer-events: none; z-index: 6; }
  .toast[data-show="true"] { opacity: 1; }
</style>
</head>
<body>
<header>
  <h1>模板图库 <small id="summary"></small></h1>
  <div class="toolbar">
    <input id="search" type="search" placeholder="搜索模板名称、标签、风格…" autocomplete="off" spellcheck="false">
    <select id="category" aria-label="按分类筛选"></select>
    <span class="matches" id="matches"></span>
  </div>
</header>
<main>
  <div class="grid" id="grid" hidden></div>
  <div class="empty" id="empty" hidden>没有匹配的模板</div>
  <div class="state" id="state">加载中…</div>
</main>
<footer>
  <span class="count" id="count">已选 0 个</span>
  <button class="ghost" id="clear" type="button" disabled>清空</button>
  <button class="action" id="copy" type="button" disabled>复制模板名称</button>
</footer>
<dialog id="detail"><div class="detail" id="detailBody"></div></dialog>
<div class="toast" id="toast"></div>
<script>
(() => {
  const params = new URLSearchParams(location.search);
  const token = params.get("token") || "";
  history.replaceState(null, "", location.pathname);

  const grid = document.getElementById("grid");
  const searchInput = document.getElementById("search");
  const categorySelect = document.getElementById("category");
  const matchesLabel = document.getElementById("matches");
  const emptyBox = document.getElementById("empty");
  const stateBox = document.getElementById("state");
  const summary = document.getElementById("summary");
  const countLabel = document.getElementById("count");
  const copyButton = document.getElementById("copy");
  const clearButton = document.getElementById("clear");
  const detail = document.getElementById("detail");
  const detailBody = document.getElementById("detailBody");
  const toast = document.getElementById("toast");

  let templates = [];
  let templatesById = new Map();
  const selected = new Set();
  let category = "全部";
  let keyword = "";

  const notify = (text) => {
    toast.textContent = text;
    toast.dataset.show = "true";
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { toast.dataset.show = "false"; }, 2200);
  };

  const fail = (text) => {
    stateBox.hidden = false;
    stateBox.textContent = text;
    grid.hidden = true;
    copyButton.disabled = true;
    clearButton.disabled = true;
  };

  const imageUrl = (id) => "/api/image/" + encodeURIComponent(id) + "?t=" + token;

  const load = async () => {
    let response;
    try {
      response = await fetch("/api/gallery", { headers: { "x-vtg-token": token } });
    } catch {
      return fail("图库服务已关闭（宿主进程结束或会话空闲超时），请重新唤起插件");
    }
    if (response.status === 503) { setTimeout(load, 800); return; }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return fail(body.message || "图库会话已失效，请重新唤起插件");
    }
    const data = await response.json();
    templates = Array.isArray(data.templates) ? data.templates : [];
    templatesById = new Map(templates.map((template) => [template.id, template]));
    summary.textContent = data.skillPath || "";
    if (!templates.length) return fail("该 Skill 未解析到任何模板。");
    stateBox.hidden = true;
    grid.hidden = false;
    renderCategories();
    applyFilters();
    renderFooter();
  };

  const renderCategories = () => {
    const categories = ["全部", ...new Set(templates.map((template) => template.category).filter(Boolean))];
    categorySelect.replaceChildren(...categories.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      return option;
    }));
    categorySelect.value = category;
  };

  const matchesKeyword = (template) => {
    if (!keyword) return true;
    const haystack = [template.name, template.category, ...(template.tags || []), ...(template.styles || []), ...(template.scenes || [])]
      .filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(keyword);
  };

  const applyFilters = () => {
    const visible = templates.filter((template) => (category === "全部" || template.category === category) && matchesKeyword(template));
    grid.replaceChildren(...visible.map(card));
    matchesLabel.textContent = visible.length === templates.length
      ? "共 " + templates.length + " 个模板"
      : visible.length + " / " + templates.length + " 个模板";
    emptyBox.hidden = visible.length > 0;
  };

  const card = (template) => {
    const node = document.createElement("article");
    node.className = "card";
    node.dataset.selected = String(selected.has(template.id));
    node.dataset.id = template.id;

    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "thumb";
    thumb.title = "查看详情";
    const preview = template.previewCandidates && template.previewCandidates.length;
    if (preview) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = template.name;
      img.src = imageUrl(template.id);
      img.addEventListener("error", () => { img.replaceWith(placeholder(template.name)); });
      thumb.append(img);
    } else {
      thumb.append(placeholder(template.name));
    }
    thumb.addEventListener("click", () => openDetail(template));

    const body = document.createElement("div");
    body.className = "body";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = template.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [template.category, (template.exampleCases || []).length ? template.exampleCases.length + " 个示例" : ""].filter(Boolean).join(" · ");

    const row = document.createElement("div");
    row.className = "row";
    const select = document.createElement("button");
    select.type = "button";
    select.className = "select";
    select.textContent = selected.has(template.id) ? "已选择" : "加入选择";
    select.addEventListener("click", () => toggle(template.id));
    row.append(select);

    body.append(name, meta, row);
    node.append(thumb, body);
    return node;
  };

  const placeholder = (name) => {
    const box = document.createElement("div");
    box.style.cssText = "width:100%;height:100%;display:grid;place-items:center;color:#888;font-size:12px;padding:8px;text-align:center";
    box.textContent = name;
    return box;
  };

  const toggle = (id) => {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    const node = grid.querySelector('[data-id="' + CSS.escape(id) + '"]');
    if (node) {
      node.dataset.selected = String(selected.has(id));
      const button = node.querySelector(".select");
      if (button) button.textContent = selected.has(id) ? "已选择" : "加入选择";
    }
    renderFooter();
  };

  const renderFooter = () => {
    countLabel.textContent = "已选 " + selected.size + " 个";
    copyButton.disabled = selected.size === 0;
    clearButton.disabled = selected.size === 0;
  };

  const openDetail = (template) => {
    const parts = [];
    const title = document.createElement("h2");
    title.textContent = template.name;
    parts.push(title);
    if (template.previewCandidates && template.previewCandidates.length) {
      const img = document.createElement("img");
      img.src = imageUrl(template.id);
      img.alt = template.name;
      parts.push(img);
    }
    const list = document.createElement("dl");
    const add = (label, value) => {
      if (!value) return;
      const dt = document.createElement("dt"); dt.textContent = label;
      const dd = document.createElement("dd"); dd.textContent = value;
      list.append(dt, dd);
    };
    add("ID", template.id);
    add("分类", template.category);
    add("风格", (template.styles || []).join("、"));
    add("场景", (template.scenes || []).join("、"));
    add("标签", (template.tags || []).join("、"));
    add("示例", (template.exampleCases || []).join("、"));
    if (list.children.length) parts.push(list);
    if (template.promptGuidance) {
      const pre = document.createElement("pre");
      pre.textContent = template.promptGuidance;
      parts.push(pre);
    }
    detailBody.replaceChildren(...parts);
    detail.showModal();
  };

  copyButton.addEventListener("click", async () => {
    const names = [...selected].map((id) => templatesById.get(id)?.name).filter(Boolean);
    if (!names.length) return;
    const text = names.join("、");
    try {
      await navigator.clipboard.writeText(text);
      notify("已复制 " + names.length + " 个模板名称，回到对话粘贴即可");
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      notify("已复制，回到对话粘贴即可");
    }
  });

  clearButton.addEventListener("click", () => {
    selected.clear();
    applyFilters();
    renderFooter();
  });

  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      keyword = searchInput.value.trim().toLowerCase();
      applyFilters();
    }, 120);
  });

  categorySelect.addEventListener("change", () => {
    category = categorySelect.value;
    applyFilters();
  });

  load();
})();
</script>
</body>
</html>`;
}
