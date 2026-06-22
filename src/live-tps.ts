import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { MessageUpdateEvent } from "./events.ts";
import { formatTps } from "./util.ts";
import type { ActiveRequest } from "./util.ts";

const REFRESH_DELAY_SECONDS = 0.5;

export function handleMessageUpdate(
  event: MessageUpdateEvent,
  ctx: ExtensionContext,
  request: ActiveRequest,
  now: number,
): void {
  const msg = event.message;
  if (msg.role !== "assistant") return;

  if (msg.usage.output > 0) {
    request.tokenCount = msg.usage.output;
  } else {
    const evt = event.assistantMessageEvent as { type?: string } | undefined;
    if (evt && (evt.type === "text_delta" || evt.type === "thinking_delta")) {
      request.tokenCount += 1;
    }
  }

  const elapsed = (now - request.startTime) / 1000;
  if (elapsed > REFRESH_DELAY_SECONDS) {
    const tps = request.tokenCount / elapsed;
    const tpsStr = formatTps(tps);
    if (tpsStr !== request.lastDisplayedTps) {
      const theme = ctx.ui.theme;
      ctx.ui.setWorkingMessage(`${theme.fg("accent", "●")} ${tpsStr} tok/s`);
      request.lastDisplayedTps = tpsStr;
    }
  }
}
