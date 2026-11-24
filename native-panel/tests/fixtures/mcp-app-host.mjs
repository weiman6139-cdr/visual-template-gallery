// Protocol test host only. This is not a Codex adapter or product entry point.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
const frame = document.getElementById("app");
const supportsContext = new URLSearchParams(location.search).get("context") !== "off";
const state = window.testHostState = { updates: [], errors: [], calls: [], rejectNext: false, delay: 0 };
document.getElementById("reject").onclick = () => { state.rejectNext = true; };
document.getElementById("slow").onclick = () => { state.delay = 500; };
const bridge = new AppBridge(null, { name: "Protocol test host (not Codex)", version: "1" }, {
  serverTools: {}, ...(supportsContext ? { updateModelContext: { text: {}, structuredContent: {} } } : {}),
}, { hostContext: { theme: "light", displayMode: "inline", containerDimensions: { width: 440, maxHeight: 900 } } });
bridge.oncalltool = async (params) => {
  state.calls.push(params.name);
  const response = await fetch("/tool", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params) });
  return response.json();
};
bridge.onupdatemodelcontext = async (params) => {
  if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
  if (state.rejectNext) { state.rejectNext = false; state.errors.push("simulated rejection"); throw new Error("模拟宿主拒绝"); }
  state.updates.push(params);
  document.getElementById("context").textContent = JSON.stringify(params.structuredContent, null, 2);
  return {};
};
bridge.oninitialized = async () => {
  await bridge.sendToolInput({ arguments: {} });
  await bridge.sendToolResult(await (await fetch("/initial")).json());
};
bridge.onsizechange = ({ height }) => { frame.style.height = `${Math.min(900, height)}px`; };
await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
frame.src = "/app";
