import assert from "node:assert";
import { describe, it } from "node:test";
import { createSessionState, createTaskState, emptyUsage } from "../src/util.ts";
import { handleTpsCommand } from "../src/tps-command.ts";
import { createMockContext, mockConsole } from "./mocks.ts";

describe("handleTpsCommand", () => {
  it("warns when there is no data", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    handleTpsCommand(ctx, session);
    assert.deepStrictEqual(ctx.logs, ["No TPS measurement yet"]);
  });

  it("logs last task and session stats in non-TUI mode", () => {
    const ctx = createMockContext({ hasUI: false });
    const session = createSessionState();
    session.lastColoredLines = ["TPS line", "Token line"];

    const task = createTaskState(0);
    task.requestCount = 1;
    task.usage = { ...emptyUsage(), input: 10, output: 20, cacheRead: 5, totalTokens: 35 };
    task.apiTimeMs = 1000;
    session.stats.set("model-a", {
      requestCount: 1,
      toolCount: 0,
      apiTimeMs: 1000,
      usage: task.usage,
    });

    const logs: string[] = [];
    const { restore } = mockConsole(logs, []);
    try {
      handleTpsCommand(ctx, session);
    } finally {
      restore();
    }

    const output = logs.join("\n");
    assert.ok(output.includes("Last Task"));
    assert.ok(output.includes("TPS line"));
    assert.ok(output.includes("Session by model"));
    assert.ok(output.includes("model-a"));
  });

  it("uses UI select in TUI mode", async () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    session.lastColoredLines = ["line"];

    await handleTpsCommand(ctx, session);

    assert.strictEqual(ctx.selectCalls.length, 1);
    assert.ok(ctx.selectCalls[0].includes("Last Task"));
  });
});
