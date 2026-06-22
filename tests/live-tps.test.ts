import assert from "node:assert";
import { describe, it } from "node:test";
import { createActiveRequest } from "../src/util.ts";
import { handleMessageUpdate } from "../src/live-tps.ts";
import { createMockContext } from "./mocks.ts";

function makeUpdate({
  role = "assistant",
  output = 0,
  eventType = "text_delta",
}: {
  role?: string;
  output?: number;
  eventType?: string;
} = {}) {
  return {
    message: {
      role,
      usage: { output },
    },
    assistantMessageEvent: { type: eventType },
  } as any;
}

describe("handleMessageUpdate", () => {
  it("ignores non-assistant messages", () => {
    const ctx = createMockContext();
    const request = createActiveRequest(0);
    handleMessageUpdate(makeUpdate({ role: "user" }), ctx, request, 0);
    assert.strictEqual(request.tokenCount, 0);
    assert.deepStrictEqual(ctx.workingMessages, []);
  });

  it("uses reported output tokens when available", () => {
    const ctx = createMockContext();
    const request = createActiveRequest(0);
    handleMessageUpdate(makeUpdate({ output: 42 }), ctx, request, 1000);
    assert.strictEqual(request.tokenCount, 42);
  });

  it("increments token count on text deltas before delay", () => {
    const ctx = createMockContext();
    const request = createActiveRequest(0);
    handleMessageUpdate(makeUpdate(), ctx, request, 100);
    handleMessageUpdate(makeUpdate({ eventType: "thinking_delta" }), ctx, request, 200);
    handleMessageUpdate(makeUpdate({ eventType: "other" }), ctx, request, 300);
    assert.strictEqual(request.tokenCount, 2);
    assert.deepStrictEqual(ctx.workingMessages, []);
  });

  it("updates working message after refresh delay", () => {
    const ctx = createMockContext();
    const request = createActiveRequest(0);
    handleMessageUpdate(makeUpdate(), ctx, request, 100);
    handleMessageUpdate(makeUpdate(), ctx, request, 600);
    assert.strictEqual(ctx.workingMessages.length, 1);
    assert.ok(ctx.workingMessages[0]!.includes("tok/s"));
  });

  it("does not repeat the same formatted TPS string", () => {
    const ctx = createMockContext();
    const request = createActiveRequest(0);
    request.tokenCount = 0;
    // Use a non-delta event so the token count stays at 0.
    handleMessageUpdate(makeUpdate({ eventType: "other" }), ctx, request, 600);
    const first = ctx.workingMessages.length;
    handleMessageUpdate(makeUpdate({ eventType: "other" }), ctx, request, 700);
    assert.strictEqual(ctx.workingMessages.length, first);
  });
});
