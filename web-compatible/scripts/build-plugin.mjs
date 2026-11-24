import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const plugin = new URL("../plugins/visual-template-gallery/", import.meta.url);
const dist = new URL("../dist/visual-template-gallery/", import.meta.url);

// 清理旧版本遗留：面板时期的内联页面、脚本副本与静态资源目录
await rm(new URL("public/", plugin), { recursive: true, force: true });
await rm(new URL("assets/", plugin), { recursive: true, force: true });
await rm(new URL("scripts/", plugin), { recursive: true, force: true });

await build({
  absWorkingDir: project,
  entryPoints: ["src/mcp/server.ts"],
  outfile: fileURLToPath(new URL("server.mjs", plugin)),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});

// 发行包：宿主中立的四件套，不含任何宿主专有清单
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ["server.mjs", "SKILL.md", "mcp.json", "README.md"]) {
  await cp(new URL(file, plugin), new URL(file, dist));
}

console.log(`已构建：${fileURLToPath(plugin)}`);
console.log(`已生成发行包：${fileURLToPath(dist)}`);
