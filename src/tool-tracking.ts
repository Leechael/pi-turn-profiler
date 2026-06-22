import type { ToolExecutionEndEvent, ToolExecutionStartEvent } from "./events.ts";
import type { TaskState } from "./util.ts";

export function handleToolExecutionStart(
  task: TaskState | null,
  event: ToolExecutionStartEvent,
  now: number,
): void {
  if (!task) return;
  if (task.activeTools.size === 0) {
    task.activeToolWallStart = now;
  }
  task.activeTools.set(event.toolCallId, now);
}

export function handleToolExecutionEnd(
  task: TaskState | null,
  event: ToolExecutionEndEvent,
  now: number,
): void {
  if (!task) return;
  const start = task.activeTools.get(event.toolCallId);
  if (start !== undefined) {
    task.toolSumMs += Math.max(0, now - start);
    task.activeTools.delete(event.toolCallId);
  }
  if (task.activeTools.size === 0 && task.activeToolWallStart !== undefined) {
    task.toolWallMs += Math.max(0, now - task.activeToolWallStart);
    task.activeToolWallStart = undefined;
  }
}
