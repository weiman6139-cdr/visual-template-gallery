#!/usr/bin/env node
// 客户端一致性自检：判断"当前正在运行的东西"和"磁盘上的东西"是否一致。
// 只读，不修改任何文件，不结束任何进程。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const APP = "/Applications/ChatGPT.app";
const PLUGIN_ID = "visual-template-gallery";
const CACHE_ROOT = path.join(os.homedir(), ".codex", "plugins", "cache", "visual-template-local");
const DIAG = path.join(os.homedir(), ".cache", "visual-template-gallery", "app-diag.jsonl");
const rows = [];
const add = (level, item, detail) => rows.push({ level, item, detail });

function sh(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: "utf8" }).trim(); } catch { return ""; }
}

// 1) 安装包版本 vs 运行中进程：进程早于安装包 = 内存里跑的是旧代码
const plist = path.join(APP, "Contents", "Info.plist");
const bundleVersion = existsSync(plist) ? sh("defaults", ["read", plist, "CFBundleShortVersionString"]) : "";
const bundleMtime = existsSync(plist) ? statSync(plist).mtimeMs : 0;
add(bundleVersion ? "ok" : "fail", "客户端安装包", bundleVersion || "未找到 /Applications/ChatGPT.app");

const procs = sh("ps", ["-axo", "pid,lstart,command"])
  .split("\n")
  .filter((line) => line.includes("ChatGPT.app/Contents/MacOS/ChatGPT") && !line.includes("grep"));
if (!procs.length) add("fail", "客户端进程", "未运行");
for (const line of procs) {
  const parts = line.trim().split(/\s+/);
  const pid = parts[0];
  const started = parts.slice(1, 6).join(" ");
  const startedMs = Date.parse(started);
  if (Number.isFinite(startedMs) && bundleMtime && startedMs < bundleMtime - 60_000) {
    add("warn", "客户端进程", `PID ${pid} 启动于 ${started}，早于当前安装包 → 请完全退出重开`);
  } else {
    add("ok", "客户端进程", `PID ${pid} 启动于 ${started}`);
  }
}

// 2) 插件缓存版本 vs 配置指向
const versionDir = path.join(CACHE_ROOT, PLUGIN_ID);
const versions = existsSync(versionDir) ? sh("ls", [versionDir]).split("\n").filter(Boolean) : [];
add(versions.length === 1 ? "ok" : "warn", "插件缓存版本", versions.join(", ") || "无");

const configText = existsSync(path.join(os.homedir(), ".codex", "config.toml"))
  ? readFileSync(path.join(os.homedir(), ".codex", "config.toml"), "utf8") : "";
add(configText.includes(PLUGIN_ID) ? "ok" : "warn", "插件已启用", configText.includes(PLUGIN_ID) ? "是" : "config.toml 未见该插件");

// 3) 图库 MCP 子进程：必须存在、且工作目录指向当前缓存版本（文件还在）
const latestVersion = [...versions].sort().pop();
const childPids = sh("ps", ["-axo", "pid,command"]).split("\n")
  .filter((line) => line.includes("server.mjs") && !line.includes("grep"))
  .map((line) => line.trim().split(/\s+/)[0]);
const galleryChildren = [];
for (const pid of childPids) {
  const cwdLine = sh("lsof", ["-p", pid]).split("\n").find((line) => /\scwd\s/.test(" " + line + " "));
  const cwdPath = cwdLine ? cwdLine.trim().split(/\s+/).slice(-1)[0] : "";
  if (cwdPath.includes("visual-template-gallery")) galleryChildren.push({ pid, cwdPath });
}
if (!galleryChildren.length) {
  add("warn", "图库 MCP 子进程", "无（会在下一次调用时按需启动）");
} else {
  for (const child of galleryChildren) {
    const version = child.cwdPath.split("/").pop();
    if (!existsSync(child.cwdPath)) {
      add("fail", "图库 MCP 子进程", "PID " + child.pid + " 的工作目录 " + version + " 已被删除，仍在跑旧代码 → 需重启客户端（或结束该进程）");
    } else if (latestVersion && version !== latestVersion) {
      add("warn", "图库 MCP 子进程", "PID " + child.pid + " 运行 " + version + "，缓存最新是 " + latestVersion + " → 宿主仍用旧子进程");
    } else {
      add("ok", "图库 MCP 子进程", "PID " + child.pid + " 运行 " + version);
    }
  }
}

// 4) 最近一次挂载形态与插件版本
if (existsSync(DIAG)) {
  const entries = readFileSync(DIAG, "utf8").trim().split("\n").slice(-60)
    .flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const lastConnected = [...entries].reverse().find((entry) => entry.event === "connected");
  const modes = lastConnected?.data?.hostContext?.availableDisplayModes;
  add(lastConnected ? "ok" : "warn", "最近一次挂载",
    lastConnected
      ? `${lastConnected.at} · displayMode=${lastConnected.data?.hostContext?.displayMode} · 插件版本=${lastConnected.pluginVersion ?? "未知(旧包)"}`
      : "无记录（可能从未挂载，或诊断文件被清空）");
  if (lastConnected && !lastConnected.pluginVersion) add("warn", "诊断版本字段", "最近记录无插件版本 → 当时跑的是旧包");
  const lastVersion = [...versions].sort().pop();
  if (lastConnected?.pluginVersion && lastVersion && lastConnected.pluginVersion !== lastVersion) {
    add("warn", "版本一致性", `最近挂载 ${lastConnected.pluginVersion} ≠ 缓存 ${lastVersion} → 宿主仍在用旧子进程`);
  }
  if (Array.isArray(modes) && modes.length === 1 && modes[0] === "fullscreen") {
    add("warn", "显示模式", "宿主只提供 fullscreen（可能跳过内联阶段，面板不会落在右侧）");
  }
  const tail = entries.slice(entries.indexOf(lastConnected ?? {}) + 1);
  const request = tail.find((entry) => entry.event === "display-request");
  const result = tail.find((entry) => entry.event === "display-result");
  if (lastConnected) {
    if (lastConnected.data?.hostContext?.displayMode === "fullscreen") {
      add("warn", "呈现形态", "最近一次是直接以 fullscreen 创建（无内联阶段）；0.2.12+ 会自动复位");
    } else if (request && result?.data?.mode === "fullscreen") {
      add("ok", "呈现形态", "inline 创建 → 自动请求 fullscreen → 已被宿主接受");
    } else if (request && result) {
      add("warn", "呈现形态", `请求 fullscreen 但宿主回执 mode=${result.data?.mode}`);
    } else if (request) {
      add("warn", "呈现形态", "已请求 fullscreen 但没有回执（宿主可能拒绝或视图被关闭）");
    } else {
      add("warn", "呈现形态", "未见展开请求，面板可能停在内联");
    }
    if (tail.some((entry) => entry.event === "no-tool-result")) {
      add("warn", "工具结果投递", "有实例未收到工具结果（该视图会是空壳）");
    }
    if (tail.some((entry) => entry.event === "session-recover")) {
      add("warn", "会话恢复", "发生过会话失效自愈（旧标签或 MCP 进程重启）");
    }
  }
} else {
  add("warn", "诊断文件", "尚未生成，说明 App 从未挂载过");
}

// 5) 登录/工作区健康（大量报错会导致客户端退到本地形态）
const today = new Date();
const logDir = path.join(os.homedir(), "Library", "Logs", "com.openai.codex",
  String(today.getFullYear()), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0"));
if (existsSync(logDir)) {
  let signIn = 0;
  for (const file of execFileSync("ls", [logDir], { encoding: "utf8" }).split("\n").filter(Boolean)) {
    const text = readFileSync(path.join(logDir, file), "utf8");
    signIn += (text.match(/Sign in to ChatGPT to start a durable thread/g) || []).length;
  }
  add(signIn > 2000 ? "warn" : "ok", "登录/durable 错误",
    `今日 ${signIn} 条${signIn > 2000 ? " → 客户端可能退到本地形态（表现为\"像旧版界面\"）；请在客户端重新登录后再验收" : ""}`);
}

const icon = { ok: "✅", warn: "⚠️ ", fail: "❌" };
for (const row of rows) console.log(`${icon[row.level]} ${row.item.padEnd(14)} ${row.detail}`);
const worst = rows.some((row) => row.level === "fail") ? 2 : rows.some((row) => row.level === "warn") ? 1 : 0;
console.log(`\n${worst === 0 ? "一致性检查通过" : worst === 1 ? "存在需要注意的项（见上）" : "存在会导致插件不可用的问题"}`);
process.exit(worst);
