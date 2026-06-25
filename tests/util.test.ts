import assert from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  addUsage,
  cacheHitColor,
  computeCacheSavings,
  createActiveRequest,
  createSessionState,
  createTaskState,
  emptyCost,
  emptyUsage,
  finishActiveTools,
  formatCost,
  formatTime,
  formatTps,
  getOrCreateModelStats,
  getTaskModelId,
  getToolCallCount,
} from "../src/util.ts";
import turnProfilerExtension from "../index.ts";

describe("formatTps", () => {
  it("formats high tps without decimals", () => {
    assert.strictEqual(formatTps(1500), "1500");
  });

  it("formats medium tps with one decimal", () => {
    assert.strictEqual(formatTps(150), "150.0");
  });

  it("formats low tps with two decimals", () => {
    assert.strictEqual(formatTps(15.1234), "15.12");
  });
});

describe("formatTime", () => {
  it("formats milliseconds", () => {
    assert.strictEqual(formatTime(500), "500ms");
  });

  it("formats seconds", () => {
    assert.strictEqual(formatTime(1500), "1.5s");
  });
});

describe("formatCost", () => {
  it("returns $0 for zero", () => {
    assert.strictEqual(formatCost(0), "$0");
  });

  it("formats small costs with 4 decimals", () => {
    assert.strictEqual(formatCost(0.005), "$0.0050");
  });

  it("formats medium costs with 3 decimals", () => {
    assert.strictEqual(formatCost(0.1234), "$0.123");
  });

  it("formats large costs with 2 decimals", () => {
    assert.strictEqual(formatCost(12.3456), "$12.35");
  });
});

describe("cacheHitColor", () => {
  it("returns success for high hit rate", () => {
    assert.strictEqual(cacheHitColor(80), "success");
  });

  it("returns warning for medium hit rate", () => {
    assert.strictEqual(cacheHitColor(50), "warning");
  });

  it("returns error for low hit rate", () => {
    assert.strictEqual(cacheHitColor(49), "error");
  });
});

describe("addUsage", () => {
  it("aggregates usage correctly", () => {
    const target = emptyUsage();
    const usage = {
      input: 10,
      output: 20,
      cacheRead: 5,
      cacheWrite: 2,
      totalTokens: 37,
      cost: { input: 0.01, output: 0.02, cacheRead: 0.005, cacheWrite: 0.002, total: 0.037 },
    };
    addUsage(target, usage);
    assert.strictEqual(target.input, 10);
    assert.strictEqual(target.output, 20);
    assert.strictEqual(target.totalTokens, 37);
    assert.strictEqual(target.cost.total, 0.037);
  });

  it("keeps zero totalTokens when explicitly zero", () => {
    const target = emptyUsage();
    const usage = {
      input: 1,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
      totalTokens: 0,
      cost: emptyCost(),
    };
    addUsage(target, usage);
    assert.strictEqual(target.totalTokens, 0);
  });
});

describe("getToolCallCount", () => {
  it("counts tool calls", () => {
    const msg = { content: [{ type: "toolCall" }, { type: "text" }, { type: "toolCall" }] };
    assert.strictEqual(getToolCallCount(msg), 2);
  });

  it("returns 0 for empty content", () => {
    assert.strictEqual(getToolCallCount({}), 0);
  });
});

describe("computeCacheSavings", () => {
  it("computes cache read savings", () => {
    const usage = emptyUsage();
    usage.input = 100;
    usage.cacheRead = 50;
    usage.cost.input = 0.1;
    usage.cost.cacheRead = 0.03;
    const result = computeCacheSavings(usage);
    assert.strictEqual(result.saved, 0.02);
    assert.strictEqual(result.cacheWriteCost, 0);
  });

  it("returns zero saved when no input", () => {
    const usage = emptyUsage();
    usage.cost.cacheWrite = 0.01;
    const result = computeCacheSavings(usage);
    assert.strictEqual(result.saved, 0);
    assert.strictEqual(result.cacheWriteCost, 0.01);
  });
});

describe("createSessionState", () => {
  it("returns initial session state", () => {
    const s = createSessionState();
    assert.strictEqual(s.currentTask, null);
    assert.strictEqual(s.currentRequest, null);
    assert.strictEqual(s.lastColoredLines.length, 0);
    assert.ok(s.stats instanceof Map);
    assert.strictEqual(s.stats.size, 0);
  });
});

describe("createActiveRequest", () => {
  it("returns initial request state", () => {
    const request = createActiveRequest(123);
    assert.strictEqual(request.startTime, 123);
    assert.strictEqual(request.responseTime, undefined);
    assert.strictEqual(request.tokenCount, 0);
    assert.strictEqual(request.lastDisplayedTps, "");
  });
});

describe("createTaskState", () => {
  it("returns initial task state", () => {
    const task = createTaskState(456);
    assert.strictEqual(task.startTime, 456);
    assert.strictEqual(task.requestCount, 0);
    assert.strictEqual(task.apiTimeMs, 0);
    assert.strictEqual(task.responseWaitMs, 0);
    assert.strictEqual(task.responseWaitCount, 0);
    assert.strictEqual(task.toolCount, 0);
    assert.strictEqual(task.toolSumMs, 0);
    assert.strictEqual(task.toolWallMs, 0);
    assert.strictEqual(task.activeToolWallStart, undefined);
    assert.ok(task.activeTools instanceof Map);
    assert.deepStrictEqual(task.usage, emptyUsage());
    assert.ok(task.modelIds instanceof Set);
    assert.strictEqual(task.modelIds.size, 0);
  });
});

describe("finishActiveTools", () => {
  it("adds unfinished wall and sum time", () => {
    const task = createTaskState(0);
    task.activeToolWallStart = 10;
    task.activeTools.set("a", 10);
    task.activeTools.set("b", 20);

    finishActiveTools(task, 50);

    assert.strictEqual(task.toolWallMs, 40);
    assert.strictEqual(task.toolSumMs, 70);
    assert.strictEqual(task.activeToolWallStart, undefined);
    assert.strictEqual(task.activeTools.size, 0);
  });

  it("keeps completed tool timing unchanged", () => {
    const task = createTaskState(0);
    task.toolWallMs = 25;
    task.toolSumMs = 30;

    finishActiveTools(task, 50);

    assert.strictEqual(task.toolWallMs, 25);
    assert.strictEqual(task.toolSumMs, 30);
  });
});

describe("getTaskModelId", () => {
  it("returns fallback when no request model was recorded", () => {
    const task = createTaskState(0);
    assert.strictEqual(getTaskModelId(task, "fallback"), "fallback");
  });

  it("returns the actual response model for single-model tasks", () => {
    const task = createTaskState(0);
    task.modelIds.add("actual-model");
    assert.strictEqual(getTaskModelId(task, "fallback"), "actual-model");
  });

  it("returns mixed for multi-model tasks", () => {
    const task = createTaskState(0);
    task.modelIds.add("model-a");
    task.modelIds.add("model-b");
    assert.strictEqual(getTaskModelId(task, "fallback"), "mixed");
  });
});

describe("emptyUsage", () => {
  it("returns zero usage with nested cost", () => {
    const u = emptyUsage();
    assert.strictEqual(u.input, 0);
    assert.strictEqual(u.output, 0);
    assert.strictEqual(u.cacheRead, 0);
    assert.strictEqual(u.cacheWrite, 0);
    assert.strictEqual(u.totalTokens, 0);
    assert.strictEqual(u.cost.input, 0);
    assert.strictEqual(u.cost.output, 0);
    assert.strictEqual(u.cost.cacheRead, 0);
    assert.strictEqual(u.cost.cacheWrite, 0);
    assert.strictEqual(u.cost.total, 0);
  });
});

describe("emptyCost", () => {
  it("returns all zero cost fields", () => {
    const c = emptyCost();
    assert.strictEqual(c.input, 0);
    assert.strictEqual(c.output, 0);
    assert.strictEqual(c.cacheRead, 0);
    assert.strictEqual(c.cacheWrite, 0);
    assert.strictEqual(c.total, 0);
  });
});

describe("getOrCreateModelStats", () => {
  it("creates new stats when modelId is absent", () => {
    const stats = new Map<string, any>();
    const s = getOrCreateModelStats(stats, "m1");
    assert.strictEqual(s.requestCount, 0);
    assert.strictEqual(s.toolCount, 0);
    assert.strictEqual(s.apiTimeMs, 0);
    assert.deepStrictEqual(s.usage, emptyUsage());
    assert.strictEqual(stats.get("m1"), s);
  });

  it("returns existing stats when modelId is present", () => {
    const stats = new Map<string, any>();
    const first = getOrCreateModelStats(stats, "m1");
    const second = getOrCreateModelStats(stats, "m1");
    assert.strictEqual(first, second);
    assert.strictEqual(stats.get("m1"), second);
  });
});

describe("turnProfilerExtension lifecycle", () => {
  it("records actual response model, unfinished tool time, JSONL, and non-TUI output", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "pi-turn-profiler-test-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args: any[]) => {
      logs.push(args.map(String).join(" "));
    };
    process.env.PI_CODING_AGENT_DIR = agentDir;

    try {
      const handlers = new Map<string, any>();
      const commands = new Map<string, any>();
      turnProfilerExtension({
        on: (event: string, handler: any) => handlers.set(event, handler),
        registerCommand: (name: string, command: any) => commands.set(name, command),
      } as any);

      const theme = {
        bold: (value: string) => value,
        fg: (_color: string, value: string) => value,
      };
      const ctx = {
        hasUI: false,
        cwd: "/tmp/project",
        model: { id: "ui-model" },
        ui: {
          theme,
          notify: () => {},
          setWorkingMessage: () => {},
          select: async () => undefined,
        },
      };
      const emit = async (event: string, payload: any = {}) => {
        const handler = handlers.get(event);
        assert.ok(handler, `missing handler for ${event}`);
        await handler(payload, ctx);
      };

      await emit("agent_start");
      await emit("before_provider_request");
      await emit("after_provider_response");
      await emit("message_end", {
        message: {
          role: "assistant",
          model: "actual-model",
          content: [{ type: "toolCall" }],
          usage: {
            input: 10,
            output: 5,
            cacheRead: 2,
            cacheWrite: 1,
            totalTokens: 18,
            cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0.002, total: 0.033 },
          },
        },
      });
      await emit("tool_execution_start", { toolCallId: "tool-1", toolName: "bash", args: {} });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await emit("agent_end", { messages: [] });

      const files = readdirSync(join(agentDir, "tps")).filter((file) => file.endsWith(".jsonl"));
      assert.strictEqual(files.length, 1);
      const record = JSON.parse(readFileSync(join(agentDir, "tps", files[0]), "utf8").trim());
      assert.strictEqual(record.model, "actual-model");
      assert.strictEqual(record.req, 1);
      assert.strictEqual(record.tools, 1);
      assert.strictEqual(record.out, 5);
      assert.strictEqual(record.total, 18);
      assert.ok(record.toolWallMs > 0);
      assert.ok(record.toolSumMs > 0);

      assert.strictEqual(
        logs.filter((line) => line.includes("#1") && line.includes("5 out")).length,
        0,
        "notify should be silent in non-TUI mode",
      );

      const command = commands.get("tps");
      assert.ok(command);
      await command.handler([], ctx);
      assert.ok(
        logs.some((line) => line.includes("Session by model") && line.includes("actual-model")),
      );
    } finally {
      console.log = originalLog;
      if (previousAgentDir === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      }
      rmSync(agentDir, { recursive: true, force: true });
    }
  });
});

describe("formatTps boundary values", () => {
  it("formats 1000 with no decimals", () => {
    assert.strictEqual(formatTps(1000), "1000");
  });

  it("formats 100 with one decimal", () => {
    assert.strictEqual(formatTps(100), "100.0");
  });

  it("formats 99.99 with two decimals", () => {
    assert.strictEqual(formatTps(99.99), "99.99");
  });
});

describe("formatCost boundary values", () => {
  it("formats 0.01 with three decimals", () => {
    assert.strictEqual(formatCost(0.01), "$0.010");
  });

  it("formats 1 with two decimals", () => {
    assert.strictEqual(formatCost(1), "$1.00");
  });
});
