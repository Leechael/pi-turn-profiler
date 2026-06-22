import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentEndEvent } from "./events.ts";
import {
  cacheHitColor,
  computeCacheSavings,
  finishActiveTools,
  formatCost,
  formatTps,
  formatTime,
  getTaskModelId,
} from "./util.ts";
import { notify, notifyError } from "./notify.ts";
import { writeTpsRecord } from "./persistence.ts";
import type { SessionState } from "./util.ts";

export function handleAgentEnd(
  _event: AgentEndEvent,
  ctx: ExtensionContext,
  session: SessionState,
  endTime: number,
): void {
  const task = session.currentTask;
  if (!task) return;

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
  notify(ctx, parts.join("  "), "info");

  try {
    writeTpsRecord({
      ts: new Date().toISOString(),
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
    });
  } catch (err) {
    notifyError(ctx, "failed to write TPS record", err);
  }

  session.currentTask = null;
  session.currentRequest = null;
}
