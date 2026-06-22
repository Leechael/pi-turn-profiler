export interface CostTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: CostTotals;
}

export interface ActiveRequest {
  startTime: number;
  responseTime?: number;
  tokenCount: number;
  lastDisplayedTps: string;
}

export interface TaskState {
  startTime: number;
  requestCount: number;
  apiTimeMs: number;
  responseWaitMs: number;
  responseWaitCount: number;
  toolCount: number;
  toolSumMs: number;
  toolWallMs: number;
  activeToolWallStart?: number;
  activeTools: Map<string, number>;
  usage: UsageTotals;
  modelIds: Set<string>;
}

export interface SessionModelStats {
  requestCount: number;
  toolCount: number;
  apiTimeMs: number;
  usage: UsageTotals;
}

export interface SessionState {
  currentTask: TaskState | null;
  currentRequest: ActiveRequest | null;
  lastColoredLines: string[];
  stats: Map<string, SessionModelStats>;
}

export function createSessionState(): SessionState {
  return {
    currentTask: null,
    currentRequest: null,
    lastColoredLines: [],
    stats: new Map(),
  };
}

export function createActiveRequest(startTime: number): ActiveRequest {
  return {
    startTime,
    tokenCount: 0,
    lastDisplayedTps: "",
  };
}

export function createTaskState(startTime: number): TaskState {
  return {
    startTime,
    requestCount: 0,
    apiTimeMs: 0,
    responseWaitMs: 0,
    responseWaitCount: 0,
    toolCount: 0,
    toolSumMs: 0,
    toolWallMs: 0,
    activeTools: new Map(),
    usage: emptyUsage(),
    modelIds: new Set(),
  };
}

export function finishActiveTools(task: TaskState, endTime: number): void {
  if (task.activeTools.size === 0) return;

  if (task.activeToolWallStart !== undefined) {
    task.toolWallMs += Math.max(0, endTime - task.activeToolWallStart);
    task.activeToolWallStart = undefined;
  }

  for (const start of task.activeTools.values()) {
    task.toolSumMs += Math.max(0, endTime - start);
  }
  task.activeTools.clear();
}

export function getTaskModelId(task: TaskState, fallback: string): string {
  if (task.modelIds.size === 0) return fallback;
  if (task.modelIds.size > 1) return "mixed";
  return task.modelIds.values().next().value ?? fallback;
}

export function formatTps(tps: number): string {
  if (tps >= 1000) return `${tps.toFixed(0)}`;
  if (tps >= 100) return `${tps.toFixed(1)}`;
  return `${tps.toFixed(2)}`;
}

export function formatTime(ms: number): string {
  const seconds = ms / 1000;
  return seconds >= 1 ? `${seconds.toFixed(1)}s` : `${ms.toFixed(0)}ms`;
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function emptyCost(): CostTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

export function cacheHitColor(rate: number): "success" | "warning" | "error" {
  if (rate >= 80) return "success";
  if (rate >= 50) return "warning";
  return "error";
}

export function emptyUsage(): UsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: emptyCost(),
  };
}

export function addUsage(target: UsageTotals, usage: UsageTotals): void {
  target.input += usage.input ?? 0;
  target.output += usage.output ?? 0;
  target.cacheRead += usage.cacheRead ?? 0;
  target.cacheWrite += usage.cacheWrite ?? 0;
  target.totalTokens +=
    usage.totalTokens ?? usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  target.cost.input += usage.cost.input ?? 0;
  target.cost.output += usage.cost.output ?? 0;
  target.cost.cacheRead += usage.cost.cacheRead ?? 0;
  target.cost.cacheWrite += usage.cost.cacheWrite ?? 0;
  target.cost.total += usage.cost.total ?? 0;
}

export function getToolCallCount(message: { content?: Array<{ type?: string }> }): number {
  return message.content?.filter((c) => c.type === "toolCall").length ?? 0;
}

export function getOrCreateModelStats(
  stats: Map<string, SessionModelStats>,
  modelId: string,
): SessionModelStats {
  let s = stats.get(modelId);
  if (!s) {
    s = { requestCount: 0, toolCount: 0, apiTimeMs: 0, usage: emptyUsage() };
    stats.set(modelId, s);
  }
  return s;
}

export interface CacheSavings {
  saved: number;
  cacheWriteCost: number;
}

export function computeCacheSavings(usage: UsageTotals): CacheSavings {
  const cacheWriteCost = usage.cost.cacheWrite;
  if (usage.input <= 0) {
    return { saved: 0, cacheWriteCost };
  }
  const inputRate = usage.cost.input / usage.input;
  const savedByCacheRead =
    usage.cacheRead > 0 ? usage.cacheRead * inputRate - usage.cost.cacheRead : 0;
  return {
    saved: Math.round(Math.max(0, savedByCacheRead) * 1_000_000) / 1_000_000,
    cacheWriteCost,
  };
}
