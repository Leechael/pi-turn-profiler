import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { performance } from "node:perf_hooks";
import { createSessionState, createTaskState } from "./util.ts";
import { handleAgentEnd } from "./summary.ts";
import { handleMessageUpdate } from "./live-tps.ts";
import {
  handleAfterProviderResponse,
  handleBeforeProviderRequest,
  handleMessageEnd,
} from "./request-tracking.ts";
import { handleToolExecutionEnd, handleToolExecutionStart } from "./tool-tracking.ts";
import { handleTpsCommand } from "./tps-command.ts";

export function registerTurnProfiler(pi: ExtensionAPI): void {
  let session = createSessionState();

  pi.on("session_start", async () => {
    session = createSessionState();
  });

  pi.on("agent_start", async () => {
    session.currentTask = createTaskState(performance.now());
    session.currentRequest = null;
  });

  pi.on("before_provider_request", async () => {
    handleBeforeProviderRequest(session, performance.now());
  });

  pi.on("after_provider_response", async () => {
    if (!session.currentRequest) return;
    handleAfterProviderResponse(session.currentRequest, performance.now());
  });

  pi.on("message_update", async (event, ctx) => {
    if (!session.currentRequest) return;
    handleMessageUpdate(event, ctx, session.currentRequest, performance.now());
  });

  pi.on("message_end", async (event, ctx) => {
    handleMessageEnd(event, ctx, session, performance.now());
  });

  pi.on("tool_execution_start", async (event) => {
    handleToolExecutionStart(session.currentTask, event, performance.now());
  });

  pi.on("tool_execution_end", async (event) => {
    handleToolExecutionEnd(session.currentTask, event, performance.now());
  });

  pi.on("agent_end", async (event, ctx) => {
    handleAgentEnd(event, ctx, session, performance.now());
  });

  pi.registerCommand("tps", {
    description: "Show turn profiler details",
    handler: async (_args, ctx) => {
      await handleTpsCommand(ctx, session);
    },
  });
}
