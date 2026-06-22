import assert from "node:assert";
import { describe, it } from "node:test";
import { createTaskState } from "../src/util.ts";
import { handleToolExecutionEnd, handleToolExecutionStart } from "../src/tool-tracking.ts";

describe("handleToolExecutionStart", () => {
  it("records wall start when the first tool begins", () => {
    const task = createTaskState(0);
    handleToolExecutionStart(task, { toolCallId: "a" } as any, 10);
    assert.strictEqual(task.activeToolWallStart, 10);
    assert.strictEqual(task.activeTools.size, 1);
  });

  it("does not change wall start for subsequent tools", () => {
    const task = createTaskState(0);
    handleToolExecutionStart(task, { toolCallId: "a" } as any, 10);
    handleToolExecutionStart(task, { toolCallId: "b" } as any, 20);
    assert.strictEqual(task.activeToolWallStart, 10);
    assert.strictEqual(task.activeTools.size, 2);
  });

  it("does nothing when there is no task", () => {
    handleToolExecutionStart(null, { toolCallId: "a" } as any, 10);
  });
});

describe("handleToolExecutionEnd", () => {
  it("tracks sum time and closes wall time when last tool ends", () => {
    const task = createTaskState(0);
    handleToolExecutionStart(task, { toolCallId: "a" } as any, 10);
    handleToolExecutionEnd(task, { toolCallId: "a" } as any, 30);
    assert.strictEqual(task.toolSumMs, 20);
    assert.strictEqual(task.toolWallMs, 20);
    assert.strictEqual(task.activeTools.size, 0);
    assert.strictEqual(task.activeToolWallStart, undefined);
  });

  it("keeps wall time open while parallel tools run", () => {
    const task = createTaskState(0);
    handleToolExecutionStart(task, { toolCallId: "a" } as any, 10);
    handleToolExecutionStart(task, { toolCallId: "b" } as any, 15);
    handleToolExecutionEnd(task, { toolCallId: "a" } as any, 25);
    assert.strictEqual(task.toolSumMs, 15);
    assert.strictEqual(task.toolWallMs, 0);
    assert.strictEqual(task.activeTools.size, 1);
    assert.ok(task.activeToolWallStart !== undefined);

    handleToolExecutionEnd(task, { toolCallId: "b" } as any, 35);
    assert.strictEqual(task.toolWallMs, 25);
    assert.strictEqual(task.activeTools.size, 0);
  });

  it("ignores unknown tool call ids", () => {
    const task = createTaskState(0);
    task.toolSumMs = 5;
    handleToolExecutionEnd(task, { toolCallId: "missing" } as any, 100);
    assert.strictEqual(task.toolSumMs, 5);
  });
});
