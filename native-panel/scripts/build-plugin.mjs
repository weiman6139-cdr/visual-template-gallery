import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const plugin = new URL("../plugins/visual-template-gallery/", import.meta.url);

// Single source of truth for the release version.
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const define = { "globalThis.__PLUGIN_VERSION__": JSON.stringify(version) };

// Keep the Codex plugin manifest in step with package.json instead of editing it by hand.
const manifestUrl = new URL(".codex-plugin/plugin.json", plugin);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
if (manifest.version !== version) {
  manifest.version = version;
  await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`plugin.json 版本已同步为 ${version}`);
}

await rm(new URL("public/", plugin), { recursive: true, force: true });
await rm(new URL("scripts/", plugin), { recursive: true, force: true });
await mkdir(new URL("assets/", plugin), { recursive: true });

const app = await build({ absWorkingDir: project, entryPoints: ["src/ui/mcp-app.ts"], bundle: true, platform: "browser", format: "esm", target: "es2022", write: false, minify: true, define });
const [html, css] = await Promise.all(["src/ui/mcp-app.html", "src/ui/mcp-app.css"].map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));
await writeFile(new URL("assets/app.html", plugin), html.replace("/* APP_STYLE */", () => css).replace("/* APP_SCRIPT */", () => app.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")));

await build({ absWorkingDir: project, entryPoints: ["src/mcp/server.ts"], outfile: fileURLToPath(new URL("server.mjs", plugin)), bundle: true, platform: "node", format: "esm", target: "node20", define, banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' } });
console.log(`已构建可独立安装的 MCP App 插件（${version}）。`);
