#!/usr/bin/env node
// 只保留最新版本：发现可清理的旧缓存目录与失效进程。默认 dry-run。
// 用法：
//   npm run prune           # 只列出，不删除、不结束进程
//   npm run prune -- --yes  # 真正执行（删除无进程占用的旧缓存目录；结束后台失效子进程）
//
// 设计原则：
// 1. 进程正在使用的目录一律不删 —— 删了会让宿主 ENOENT，比"旧版本"更糟。
// 2. 只结束"代码目录已被删除"的本插件子进程；它本来也是僵留状态，宿主下次调用会重建。
// 3. 客户端主进程永不处理，只提示"需要重启"。
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CACHE_ROOT = path.join(os.homedir(), ".codex", "plugins", "cache");
const PLUGIN_ID = "visual-template-gallery";
const apply = process.argv.includes("--yes");

const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8" }).trim(); } catch { return ""; } };
const processCwds = () => {
  const map = new Map();
  for (const pid of sh("ps", ["-axo", "pid,command"]).split("\n")
    .filter((line) => /node|codex/i.test(line) && !line.includes("grep"))
    .map((line) => line.trim().split(/\s+/)[0])) {
    const line = sh("lsof", ["-p", pid]).split("\n").find((value) => /\scwd\s/.test(` ${value} `));
    if (line) map.set(pid, line.trim().split(/\s+/).slice(-1)[0]);
  }
  return map;
};

const cwds = processCwds();
const inUse = (dir) => [...cwds.values()].some((cwd) => cwd === dir || cwd.startsWith(`${dir}${path.sep}`));

const actions = [];
const notes = [];
for (const marketplace of existsSync(CACHE_ROOT) ? readdirSync(CACHE_ROOT) : []) {
  const marketDir = path.join(CACHE_ROOT, marketplace);
  if (!statSync(marketDir).isDirectory()) continue;
  for (const plugin of readdirSync(marketDir)) {
    const pluginDir = path.join(marketDir, plugin);
    if (!statSync(pluginDir).isDirectory()) continue;
    // latest 是安装器维护的软链，不是版本目录，必须排除。
    const entries = readdirSync(pluginDir).filter((name) => {
      const full = path.join(pluginDir, name);
      const info = lstatSync(full);
      return info.isDirectory() && !info.isSymbolicLink();
    });
    if (entries.length < 2) continue;
    const newest = [...entries].sort().pop();
    for (const version of entries) {
      if (version === newest) continue;
      const dir = path.join(pluginDir, version);
      if (inUse(dir)) notes.push(`保留 ${plugin}/${version}：有进程正在使用（删掉会让宿主报错）`);
      else actions.push({ type: "dir", target: dir, label: `${plugin}/${version}（旧版本，缓存最新为 ${newest}）` });
    }
  }
}

// 失效的图库子进程：代码目录已被删除，仍在跑旧代码
for (const [pid, cwd] of cwds) {
  if (!cwd.includes(PLUGIN_ID)) continue;
  if (existsSync(cwd)) continue;
  actions.push({ type: "proc", target: pid, label: `PID ${pid} 运行已删除的 ${cwd.split("/").pop()}，仍在跑旧代码` });
}

// 客户端进程早于安装包 → 只能靠重启
const plist = "/Applications/ChatGPT.app/Contents/Info.plist";
if (existsSync(plist)) {
  const mtime = statSync(plist).mtimeMs;
  for (const line of sh("ps", ["-axo", "pid,lstart,command"]).split("\n")) {
    if (!line.includes("ChatGPT.app/Contents/MacOS/ChatGPT") || line.includes("grep")) continue;
    const parts = line.trim().split(/\s+/);
    const startedMs = Date.parse(parts.slice(1, 6).join(" "));
    if (Number.isFinite(startedMs) && startedMs < mtime - 60_000) {
      notes.push(`客户端 PID ${parts[0]} 启动早于安装包 → 需完全退出重开（本脚本不会处理客户端主进程）`);
    }
  }
}

if (!actions.length) console.log("没有需要清理的旧版本目录或失效进程。");
for (const action of actions) {
  if (!apply) { console.log(`[dry-run] 将清理：${action.label}`); continue; }
  try {
    if (action.type === "dir") { rmSync(action.target, { recursive: true, force: true }); console.log(`已删除目录：${action.label}`); }
    else { process.kill(Number(action.target), "SIGTERM"); console.log(`已结束进程：${action.label}`); }
  } catch (error) { console.log(`清理失败（${action.label}）：${String(error)}`); }
}
for (const note of notes) console.log(`提示：${note}`);
if (!apply && actions.length) console.log("\n以上为 dry-run。确认无误后执行：npm run prune -- --yes");
