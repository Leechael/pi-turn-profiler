import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  addUsage,
  cacheHitColor,
  computeCacheSavings,
  createActiveRequest,
  createSessionState,
  createTaskState,
  finishActiveTools,
  formatCost,
  formatTime,
  formatTps,
  getOrCreateModelStats,
  getTaskModelId,
  getToolCallCount,
  type SessionState,
  type UsageTotals,
} from "./src/util.ts";

const REFRESH_DELAY_SECONDS = 0.5;

type NotifyType = "info" | "warning" | "error";

function notify(ctx: ExtensionContext, message: string, type: NotifyType = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, type);
  } else {
    console.log(message);
  }
}

function notifyError(ctx: ExtensionContext, message: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  if (ctx.hasUI) {
    ctx.ui.notify(`${message}: ${detail}`, "error");
  } else {
    console.error(`[pi-turn-profiler] ${message}:`, err);
  }
}

function ensureTpsDir(): string {
  const dir = join(getAgentDir(), "tps");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export default function turnProfilerExtension(pi: ExtensionAPI) {
  let session: SessionState = createSessionState();

  pi.on("session_start", async () => {
    session = createSessionState();
  });

  pi.on("agent_start", async () => {
    session.currentTask = createTaskState(performance.now());
    session.currentRequest = null;
  });

  pi.on("before_provider_request", async () => {
    if (!session.currentTask) return;
    session.currentRequest = createActiveRequest(performance.now());
  });

  pi.on("after_provider_response", async () => {
    if (!session.currentRequest) return;
    session.currentRequest.responseTime = performance.now();
  });

  pi.on("message_update", async (event, ctx) => {
    const msg = event.message;
    if (msg.role !== "assistant") return;
    if (!session.currentRequest) return;

    if (msg.usage.output > 0) {
      session.currentRequest.tokenCount = msg.usage.output;
    } else {
      const evt = event.assistantMessageEvent;
      if (evt.type === "text_delta" || evt.type === "thinking_delta") {
        session.currentRequest.tokenCount += 1;
      }
    }

    const now = performance.now();
    const elapsed = (now - session.currentRequest.startTime) / 1000;
    if (elapsed > REFRESH_DELAY_SECONDS) {
      const tps = session.currentRequest.tokenCount / elapsed;
      const tpsStr = formatTps(tps);
      if (tpsStr !== session.currentRequest.lastDisplayedTps) {
        const theme = ctx.ui.theme;
        ctx.ui.setWorkingMessage(`${theme.fg("accent", "●")} ${tpsStr} tok/s`);
        session.currentRequest.lastDisplayedTps = tpsStr;
      }
    }
  });

  pi.on("message_end", async (event, ctx) => {
    const msg = event.message;
    if (msg.role !== "assistant") return;

    const request = session.currentRequest;
    if (!request) {
      // Defensive: skip accounting if before_provider_request was missed.
      return;
    }

    const endTime = performance.now();
    const elapsedMs = Math.max(0, endTime - request.startTime);

    const output = msg.usage.output;
    const input = msg.usage.input;
    const cacheRead = msg.usage.cacheRead;
    const cacheWrite = msg.usage.cacheWrite;
    const totalTokens = msg.usage.totalTokens ?? input + output + cacheRead + cacheWrite;
    const cost = msg.usage.cost;
    const toolCount = getToolCallCount(msg);
    const modelId = msg.model;

    const usageEntry: UsageTotals = { input, output, cacheRead, cacheWrite, totalTokens, cost };

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
  });

  pi.on("tool_execution_start", async (event) => {
    const task = session.currentTask;
    if (!task) return;
    const now = performance.now();
    if (task.activeTools.size === 0) {
      task.activeToolWallStart = now;
    }
    task.activeTools.set(event.toolCallId, now);
  });

  pi.on("tool_execution_end", async (event) => {
    const task = session.currentTask;
    if (!task) return;
    const now = performance.now();
    const start = task.activeTools.get(event.toolCallId);
    if (start !== undefined) {
      task.toolSumMs += Math.max(0, now - start);
      task.activeTools.delete(event.toolCallId);
    }
    if (task.activeTools.size === 0 && task.activeToolWallStart !== undefined) {
      task.toolWallMs += Math.max(0, now - task.activeToolWallStart);
      task.activeToolWallStart = undefined;
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    const task = session.currentTask;
    if (!task) return;

    const endTime = performance.now();
    finishActiveTools(task, endTime);

    const wallMs = Math.max(0, endTime - task.startTime);
    const apiTps = task.apiTimeMs > 0 ? task.usage.output / (task.apiTimeMs / 1000) : 0;
    const wallTps = wallMs > 0 ? task.usage.output / (wallMs / 1000) : 0;
    const avgWaitMs = task.responseWaitCount > 0 ? task.responseWaitMs / task.responseWaitCount : 0;

    const u = task.usage;
    const totalInput = u.input + u.cacheRead;
    const cacheHitRate = totalInput > 0 ? (u.cacheRead / totalInput) * 100 : 0;

    const { saved: savedAmount, cacheWriteCost } = computeCacheSavings(u);

    const t = ctx.ui.theme;
    const hitColor = cacheHitColor(cacheHitRate);
    const modelId = getTaskModelId(task, ctx.model?.id ?? "unknown");

    session.lastColoredLines = [
      `${t.bold("TPS")}   ${t.fg("accent", formatTps(apiTps))} tok/s API  ${t.fg("accent", formatTps(wallTps))} tok/s wall  ${t.fg("dim", modelId)}`,
      `${t.bold("Token")} out ${t.fg("accent", u.output.toLocaleString())}  in ${u.input.toLocaleString()}  total ${u.totalTokens.toLocaleString()}`,
      `${t.bold("Cache")} r ${u.cacheRead.toLocaleString()} / w ${u.cacheWrite.toLocaleString()}  hit ${t.fg(hitColor, `${cacheHitRate.toFixed(1)}%`)}`,
      `${t.bold("Time")}  api ${formatTime(task.apiTimeMs)}  wait avg ${t.fg("dim", formatTime(avgWaitMs))}  wall ${formatTime(wallMs)}`,
      `${t.bold("Exec")}  req ${task.requestCount.toLocaleString()}  tools ${task.toolCount.toLocaleString()}  tool wall ${formatTime(task.toolWallMs)}  tool sum ${formatTime(task.toolSumMs)}`,
    ];

    if (u.cost.total > 0) {
      let costLine = `${t.bold("Cost")}  ${formatCost(u.cost.total)}`;
      if (savedAmount > 0) {
        costLine += `  saved ${t.fg("success", formatCost(savedAmount))}`;
      }
      if (cacheWriteCost > 0) {
        costLine += `  cache write ${formatCost(cacheWriteCost)}`;
      }
      session.lastColoredLines.splice(3, 0, costLine);
    }

    const parts = [
      `req ${task.requestCount}`,
      `cache ${t.fg(hitColor, `${cacheHitRate.toFixed(1)}%`)}`,
    ];
    if (u.cost.total > 0) parts.push(formatCost(u.cost.total));
    parts.push(`${t.fg("accent", formatTps(apiTps))} tok/s`);
    parts.push(formatTime(wallMs));
    parts.push(t.fg("dim", modelId));
    const summaryLine = parts.join("  ");
    notify(ctx, summaryLine, "info");

    try {
      const dir = ensureTpsDir();
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const record = {
        ts: now.toISOString(),
        model: modelId,
        cwd: ctx.cwd,
        req: task.requestCount,
        tools: task.toolCount,
        out: u.output,
        in: u.input,
        cacheRead: u.cacheRead,
        cacheWrite: u.cacheWrite,
        cacheHit: Math.round(cacheHitRate * 10) / 10,
        total: u.totalTokens,
        cost: Math.round(u.cost.total * 10000) / 10000,
        saved: Math.round(savedAmount * 10000) / 10000,
        cacheWriteCost: Math.round(cacheWriteCost * 10000) / 10000,
        apiTps: Math.round(apiTps * 100) / 100,
        wallTps: Math.round(wallTps * 100) / 100,
        apiMs: Math.round(task.apiTimeMs),
        wallMs: Math.round(wallMs),
        toolWallMs: Math.round(task.toolWallMs),
        toolSumMs: Math.round(task.toolSumMs),
      };
      appendFileSync(join(dir, `tps-${day}.jsonl`), JSON.stringify(record) + "\n");
    } catch (err) {
      notifyError(ctx, "failed to write TPS record", err);
    }

    session.currentTask = null;
    session.currentRequest = null;
  });

  pi.registerCommand("tps", {
    description: "Show turn profiler details",
    handler: async (_args, ctx) => {
      if (session.stats.size === 0 && session.lastColoredLines.length === 0) {
        notify(ctx, "No TPS measurement yet", "warning");
        return;
      }

      const titleParts: string[] = [];

      if (session.lastColoredLines.length > 0) {
        titleParts.push("Last Task");
        for (const l of session.lastColoredLines) titleParts.push(`  ${l}`);
        titleParts.push("");
      }

      if (session.stats.size > 0) {
        titleParts.push("Session by model");
        for (const [mid, s] of session.stats) {
          const ti = s.usage.input + s.usage.cacheRead;
          const hit = ti > 0 ? (s.usage.cacheRead / ti) * 100 : 0;
          const tps = s.apiTimeMs > 0 ? s.usage.output / (s.apiTimeMs / 1000) : 0;
          let line = `req ${s.requestCount}  out ${s.usage.output.toLocaleString()}  cache ${hit.toFixed(1)}%  ${formatTps(tps)} tok/s`;
          if (s.usage.cost.total > 0) line += `  ${formatCost(s.usage.cost.total)}`;
          titleParts.push(`  ${mid}`);
          titleParts.push(`    ${line}`);
        }
      }

      if (ctx.hasUI) {
        await ctx.ui.select(titleParts.join("\n"), ["Done"]);
      } else {
        console.log(titleParts.join("\n"));
      }
    },
  });
}
