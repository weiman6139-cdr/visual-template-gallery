import type { TemplateReferenceContext } from "../mcp/gallery-service.js";

// Serialize updates so a slower old request cannot overwrite the latest selection.
export class ContextSync {
  private queue: Promise<void> = Promise.resolve();
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending?: { revision: number; snapshot: string[]; waiters: Array<() => void> };
  constructor(
    private readonly publish: (ids: string[]) => Promise<TemplateReferenceContext>,
    private readonly status: (state: "pending" | "synced" | "failed", error?: string) => void,
    private readonly debounceMs = 120,
  ) {}
  update(ids: string[]): Promise<void> {
    const revision = ++this.revision;
    const snapshot = [...ids];
    this.status("pending");
    const promise = new Promise<void>((resolve) => {
      if (this.pending) {
        this.pending.revision = revision;
        this.pending.snapshot = snapshot;
        this.pending.waiters.push(resolve);
      } else {
        this.pending = { revision, snapshot, waiters: [resolve] };
      }
    });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
    return promise;
  }

  private flush() {
    this.timer = undefined;
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return;
    const operation = this.queue.catch(() => {}).then(async () => {
      if (pending.revision !== this.revision) return;
      try {
        await this.publish(pending.snapshot);
        if (pending.revision === this.revision) this.status("synced");
      } catch (error) {
        if (pending.revision === this.revision) this.status("failed", error instanceof Error ? error.message : String(error));
      }
    });
    this.queue = operation;
    void operation.finally(() => pending.waiters.forEach((resolve) => resolve()));
  }
}
