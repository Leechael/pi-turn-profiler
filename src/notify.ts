import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type NotifyType = "info" | "warning" | "error";

export function notify(ctx: ExtensionContext, message: string, type: NotifyType = "info"): void {
  if (!ctx.hasUI) return;
  ctx.ui.notify(message, type);
}

export function notifyError(ctx: ExtensionContext, message: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  if (ctx.hasUI) {
    ctx.ui.notify(`${message}: ${detail}`, "error");
  } else {
    console.error(`[pi-turn-profiler] ${message}:`, err);
  }
}
