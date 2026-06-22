import assert from "node:assert";
import { describe, it } from "node:test";
import { createActiveRequest, createSessionState, createTaskState } from "../src/util.ts";
import {
  handleAfterProviderResponse,
  handleBeforeProviderRequest,
  handleMessageEnd,
} from "../src/request-tracking.ts";
import { createMockContext } from "./mocks.ts";

function makeAssistantMessage(overrides: any = {}) {
  return {
    role: "assistant",
    model: "model-a",
    content: [],
    usage: {
      input: 10,
      output: 5,
      cacheRead: 2,
      cacheWrite: 1,
      totalTokens: 18,
      cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0.002, total: 0.033 },
    },
    ...overrides,
  } as any;
}

describe("handleBeforeProviderRequest", () => {
  it("creates an active request when a task exists", () => {
    const session = createSessionState();
    session.currentTask = createTaskState(0);
    handleBeforeProviderRequest(session, 123);
    assert.ok(session.currentRequest);
    assert.strictEqual(session.currentRequest!.startTime, 123);
  });

  it("does nothing when there is no current task", () => {
    const session = createSessionState();
    handleBeforeProviderRequest(session, 123);
    assert.strictEqual(session.currentRequest, null);
  });
});

describe("handleAfterProviderResponse", () => {
  it("records the response time", () => {
    const request = createActiveRequest(0);
    handleAfterProviderResponse(request, 250);
    assert.strictEqual(request.responseTime, 250);
  });
});

describe("handleMessageEnd", () => {
  it("ignores non-assistant messages", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    session.currentTask = createTaskState(0);
    session.currentRequest = createActiveRequest(0);
    handleMessageEnd({ message: { role: "user" } } as any, ctx, session, 100);
    assert.strictEqual(session.currentTask.requestCount, 0);
  });

  it("skips accounting when there is no active request", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    session.currentTask = createTaskState(0);
    handleMessageEnd({ message: makeAssistantMessage() } as any, ctx, session, 100);
    assert.strictEqual(session.currentTask.requestCount, 0);
  });

  it("updates task and per-model stats and emits per-request summary", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    session.currentTask = createTaskState(0);
    session.currentRequest = createActiveRequest(0);
    handleAfterProviderResponse(session.currentRequest, 50);

    handleMessageEnd({ message: makeAssistantMessage() } as any, ctx, session, 100);

    assert.strictEqual(session.currentTask.requestCount, 1);
    assert.strictEqual(session.currentTask.apiTimeMs, 100);
    assert.strictEqual(session.currentTask.responseWaitMs, 50);
    assert.strictEqual(session.currentTask.responseWaitCount, 1);
    assert.strictEqual(session.currentTask.toolCount, 0);
    assert.strictEqual(session.currentTask.usage.output, 5);

    const ms = session.stats.get("model-a")!;
    assert.ok(ms);
    assert.strictEqual(ms.requestCount, 1);
    assert.strictEqual(ms.apiTimeMs, 100);

    assert.ok(ctx.logs.some((l) => l.includes("#1") && l.includes("5 out")));
    assert.ok(ctx.workingMessages.includes(undefined));
    assert.strictEqual(session.currentRequest, null);
  });

  it("counts tool calls and handles multi-model tasks", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    session.currentTask = createTaskState(0);
    session.currentRequest = createActiveRequest(0);

    handleMessageEnd(
      {
        message: makeAssistantMessage({ content: [{ type: "toolCall" }, { type: "toolCall" }] }),
      } as any,
      ctx,
      session,
      100,
    );

    assert.strictEqual(session.currentTask.toolCount, 2);
    assert.strictEqual(session.currentTask.modelIds.size, 1);

    session.currentRequest = createActiveRequest(200);
    handleMessageEnd(
      {
        message: makeAssistantMessage({ model: "model-b", content: [{ type: "toolCall" }] }),
      } as any,
      ctx,
      session,
      300,
    );

    assert.strictEqual(session.currentTask.modelIds.size, 2);
    assert.strictEqual(session.stats.get("model-b")!.toolCount, 1);
  });

  it("falls back totalTokens when not provided", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    session.currentTask = createTaskState(0);
    session.currentRequest = createActiveRequest(0);
    const msg = makeAssistantMessage();
    delete msg.usage.totalTokens;
    handleMessageEnd({ message: msg } as any, ctx, session, 100);
    assert.strictEqual(session.currentTask.usage.totalTokens, 18);
  });

  it("does not emit per-request summary when there is no input", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    session.currentTask = createTaskState(0);
    session.currentRequest = createActiveRequest(0);
    const msg = makeAssistantMessage();
    msg.usage.input = 0;
    msg.usage.cacheRead = 0;
    handleMessageEnd({ message: msg } as any, ctx, session, 100);
    assert.strictEqual(ctx.logs.length, 0);
  });

  it("adds cost to per-request summary when total cost is positive", () => {
    const ctx = createMockContext({ hasUI: true });
    const session = createSessionState();
    session.currentTask = createTaskState(0);
    session.currentRequest = createActiveRequest(0);
    handleMessageEnd({ message: makeAssistantMessage() } as any, ctx, session, 100);
    assert.ok(ctx.logs.some((l) => l.includes("$")));
  });
});
