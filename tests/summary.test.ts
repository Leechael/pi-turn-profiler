import assert from "node:assert";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, before, after } from "node:test";
import { createSessionState, createTaskState, emptyUsage } from "../src/util.ts";
import { handleAgentEnd } from "../src/summary.ts";
import { createMockContext, mockConsole } from "./mocks.ts";

describe("handleAgentEnd", () => {
  let agentDir: string;
  let previousAgentDir: string | undefined;

  before(() => {
    agentDir = mkdtempSync(join(tmpdir(), "pi-turn-profiler-summary-"));
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
  });

  after(() => {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    rmSync(agentDir, { recursive: true, force: true });
  });

  function makeTask() {
    const task = createTaskState(0);
    task.requestCount = 2;
    task.apiTimeMs = 2000;
    task.responseWaitMs = 500;
    task.responseWaitCount = 2;
    task.toolCount = 3;
    task.toolSumMs = 300;
    task.toolWallMs = 400;
    task.usage = {
      ...emptyUsage(),
      input: 100,
      output: 200,
      cacheRead: 50,
      cacheWrite: 10,
      totalTokens: 360,
      cost: {
        input: 0.1,
        output: 0.2,
        cacheRead: 0.03,
        cacheWrite: 0.01,
        total: 0.34,
      },
    };
    task.modelIds.add("model-a");
    return task;
  }

  it("does nothing when there is no current task", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    handleAgentEnd({ messages: [] } as any, ctx, session, 1000);
    assert.strictEqual(session.lastColoredLines.length, 0);
  });

  it("builds summary lines, notifies, and writes a record", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    session.currentTask = makeTask();

    handleAgentEnd({ messages: [] } as any, ctx, session, 5000);

    assert.strictEqual(session.currentTask, null);
    assert.strictEqual(session.currentRequest, null);
    assert.ok(session.lastColoredLines.some((l) => l.includes("TPS")));
    assert.ok(session.lastColoredLines.some((l) => l.includes("Token")));
    assert.ok(session.lastColoredLines.some((l) => l.includes("Cache")));
    assert.ok(session.lastColoredLines.some((l) => l.includes("Time")));
    assert.ok(session.lastColoredLines.some((l) => l.includes("Cost")));
    assert.ok(session.lastColoredLines.some((l) => l.includes("Exec")));

    assert.ok(ctx.logs.some((l) => l.includes("req 2") && l.includes("model-a")));

    const files = readdirSync(join(agentDir, "tps")).filter((f) => f.endsWith(".jsonl"));
    assert.strictEqual(files.length, 1);
    const record = JSON.parse(readFileSync(join(agentDir, "tps", files[0]), "utf8").trim());
    assert.strictEqual(record.model, "model-a");
    assert.strictEqual(record.req, 2);
    assert.strictEqual(record.out, 200);
    assert.strictEqual(record.total, 360);
  });

  it("uses ctx.model fallback and marks mixed models", () => {
    const ctx = createMockContext({ modelId: "fallback-model" });
    const session = createSessionState();
    const task = makeTask();
    task.modelIds.add("model-b");
    session.currentTask = task;

    handleAgentEnd({ messages: [] } as any, ctx, session, 5000);

    assert.ok(session.lastColoredLines.some((l) => l.includes("mixed")));
  });

  it("falls back to unknown when no model is recorded", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    const task = makeTask();
    task.modelIds.clear();
    session.currentTask = task;

    handleAgentEnd({ messages: [] } as any, ctx, session, 5000);

    assert.ok(session.lastColoredLines.some((l) => l.includes("unknown")));
  });

  it("reports write failures to stderr in non-TUI mode", () => {
    const ctx = createMockContext({ hasUI: false });
    const session = createSessionState();
    session.currentTask = makeTask();

    const errors: string[] = [];
    const { restore } = mockConsole([], errors);
    const blockedFile = join(tmpdir(), `pi-turn-profiler-blocked-${Date.now()}`);
    try {
      // A file at the agent-dir path prevents the tps directory from being created.
      writeFileSync(blockedFile, "");
      process.env.PI_CODING_AGENT_DIR = blockedFile;
      handleAgentEnd({ messages: [] } as any, ctx, session, 5000);
    } finally {
      restore();
      process.env.PI_CODING_AGENT_DIR = agentDir;
      rmSync(blockedFile, { force: true });
    }

    assert.ok(errors.some((e) => e.includes("failed to write TPS record")));
  });
});
