import assert from "node:assert";
import { describe, it } from "node:test";
import { notify, notifyError } from "../src/notify.ts";
import { createMockContext, mockConsole } from "./mocks.ts";

describe("notify", () => {
  it("writes to console.log in non-TUI mode", () => {
    const ctx = createMockContext({ hasUI: false });
    const logs: string[] = [];
    const { restore } = mockConsole(logs, []);
    try {
      notify(ctx, "hello", "info");
    } finally {
      restore();
    }
    assert.deepStrictEqual(logs, ["hello"]);
  });

  it("uses UI notify in TUI mode", () => {
    const ctx = createMockContext({ hasUI: true });
    notify(ctx, "ui hello", "warning");
    assert.deepStrictEqual(ctx.logs, ["ui hello"]);
  });

  it("defaults to info type", () => {
    const ctx = createMockContext({ hasUI: true });
    notify(ctx, "default");
    assert.deepStrictEqual(ctx.logs, ["default"]);
  });
});

describe("notifyError", () => {
  it("writes error detail to stderr in non-TUI mode", () => {
    const ctx = createMockContext({ hasUI: false });
    const logs: string[] = [];
    const errors: string[] = [];
    const { restore } = mockConsole(logs, errors);
    try {
      notifyError(ctx, "failed", new Error("boom"));
    } finally {
      restore();
    }
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes("failed"));
    assert.ok(errors[0].includes("boom"));
  });

  it("uses UI notify in TUI mode", () => {
    const ctx = createMockContext({ hasUI: true });
    notifyError(ctx, "failed", new Error("boom"));
    assert.strictEqual(ctx.logs.length, 1);
    assert.ok(ctx.logs[0].includes("failed: boom"));
  });

  it("handles non-Error values", () => {
    const ctx = createMockContext({ hasUI: true });
    notifyError(ctx, "failed", "plain string");
    assert.ok(ctx.logs[0].includes("failed: plain string"));
  });
});
