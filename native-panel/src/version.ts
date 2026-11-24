// Single source of truth is package.json. The build injects the concrete value
// through esbuild's define so the shipped plugin never carries a stale literal.
// Outside the build (dev/test) it falls back to a clearly non-release marker.
const injected = (globalThis as { __PLUGIN_VERSION__?: unknown }).__PLUGIN_VERSION__;

export const PLUGIN_VERSION = typeof injected === "string" ? injected : "0.0.0-dev";
