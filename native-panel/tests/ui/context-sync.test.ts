import { describe, expect, it, vi } from "vitest";
import { ContextSync } from "../../src/ui/context-sync.js";
import { referenceContext } from "../../src/mcp/gallery-service.js";

describe("model context synchronization", () => {
  it("coalesces rapid selection changes into one complete snapshot", async () => {
    const sent: string[][] = [];
    const status = vi.fn();
    const sync = new ContextSync(async (ids) => { sent.push(ids); return referenceContext("fixture", []); }, status, 20);
    const first = sync.update(["one"]);
    const second = sync.update(["one", "two"]);
    const final = sync.update(["two"]);

    await Promise.all([first, second, final]);
    expect(sent).toEqual([["two"]]);
    expect(status).toHaveBeenLastCalledWith("synced");
  });

  it("serializes updates and drops queued stale choices without reporting an old reply as synced", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const sent: string[][] = [];
    const status = vi.fn();
    const sync = new ContextSync(async (ids) => { sent.push(ids); if (sent.length === 1) await gate; return referenceContext("fixture", []); }, status);
    const first = sync.update(["one"]);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const middle = sync.update(["one", "two"]);
    const final = sync.update([]);
    release(); await Promise.all([first, middle, final]);
    expect(sent).toEqual([["one"], []]);
    expect(status.mock.calls.filter(([state]) => state === "synced")).toHaveLength(1);
    expect(status).toHaveBeenLastCalledWith("synced");
  });
  it("reports a rejection and permits retry of the same selection", async () => {
    const publish = vi.fn().mockRejectedValueOnce(new Error("host rejected")).mockResolvedValue(referenceContext("fixture", []));
    const status = vi.fn(); const sync = new ContextSync(publish, status);
    await sync.update(["one"]);
    expect(status).toHaveBeenLastCalledWith("failed", "host rejected");
    await sync.update(["one"]);
    expect(status).toHaveBeenLastCalledWith("synced");
    expect(publish).toHaveBeenCalledTimes(2);
  });
});
