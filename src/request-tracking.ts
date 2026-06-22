import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { MessageEndEvent } from "./events.ts";
import {
  addUsage,
  cacheHitColor,
  createActiveRequest,
  formatCost,
  getOrCreateModelStats,
  getToolCallCount,
} from "./util.ts";
import { notify } from "./notify.ts";
import type { ActiveRequest, SessionState, UsageTotals } from "./util.ts";

export function handleBeforeProviderRequest(session: SessionState, now: number): void {
  if (!session.currentTask) return;
  session.currentRequest = createActiveRequest(now);
}

export function handleAfterProviderResponse(request: ActiveRequest, now: number): void {
  request.responseTime = now;
}

export function handleMessageEnd(
  event: MessageEndEvent,
  ctx: ExtensionContext,
  session: SessionState,
  now: number,
): void {
  const msg = event.message;
  if (msg.role !== "assistant") return;

  const request = session.currentRequest;
  if (!request) {
    return;
  }

  const elapsedMs = Math.max(0, now - request.startTime);

  const output = msg.usage.output ?? 0;
  const input = msg.usage.input ?? 0;
  const cacheRead = msg.usage.cacheRead ?? 0;
  const cacheWrite = msg.usage.cacheWrite ?? 0;
  const totalTokens = msg.usage.totalTokens ?? input + output + cacheRead + cacheWrite;
  const cost = msg.usage.cost;
  const toolCount = getToolCallCount(msg);
  const modelId = msg.model;

  const usageEntry: UsageTotals = {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens,
    cost,
  };

  const task = session.currentTask;
  if (task) {
    task.requestCount += 1;
    task.apiTimeMs += elapsedMs;
    if (request.responseTime !== undefined) {
      task.responseWaitMs += Math.max(0, request.responseTime - request.startTime);
      task.responseWaitCount += 1;
    }
    addUsage(task.usage, usageEntry);
    task.toolCount += toolCount;
    task.modelIds.add(modelId);
  }

  const ms = getOrCreateModelStats(session.stats, modelId);
  ms.requestCount += 1;
  ms.toolCount += toolCount;
  ms.apiTimeMs += elapsedMs;
  addUsage(ms.usage, usageEntry);

  const reqInputTotal = input + cacheRead;
  if (reqInputTotal > 0 && task) {
    const t = ctx.ui.theme;
    const reqCacheHit = (cacheRead / reqInputTotal) * 100;
    const hitStr = t.fg(cacheHitColor(reqCacheHit), `${reqCacheHit.toFixed(1)}%`);
    let reqInfo = `${t.fg("dim", `#${task.requestCount}`)} ${t.fg("accent", output.toLocaleString())} out  cache ${hitStr}`;
    if (cost.total > 0) {
      reqInfo += `  ${formatCost(cost.total)}`;
    }
    notify(ctx, reqInfo, "info");
  }

  session.currentRequest = null;
  ctx.ui.setWorkingMessage(undefined);
}
