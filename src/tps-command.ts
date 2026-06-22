import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatCost, formatTps } from "./util.ts";
import { notify } from "./notify.ts";
import type { SessionState } from "./util.ts";

export function handleTpsCommand(
  ctx: ExtensionContext,
  session: SessionState,
): void | Promise<string | undefined> {
  if (session.stats.size === 0 && session.lastColoredLines.length === 0) {
    notify(ctx, "No TPS measurement yet", "warning");
    return;
  }

  const titleParts: string[] = [];

  if (session.lastColoredLines.length > 0) {
    titleParts.push("Last Task");
    for (const l of session.lastColoredLines) titleParts.push(`  ${l}`);
    titleParts.push("");
  }

  if (session.stats.size > 0) {
    titleParts.push("Session by model");
    for (const [mid, s] of session.stats) {
      const ti = s.usage.input + s.usage.cacheRead;
      const hit = ti > 0 ? (s.usage.cacheRead / ti) * 100 : 0;
      const tps = s.apiTimeMs > 0 ? s.usage.output / (s.apiTimeMs / 1000) : 0;
      let line = `req ${s.requestCount}  out ${s.usage.output.toLocaleString()}  cache ${hit.toFixed(1)}%  ${formatTps(tps)} tok/s`;
      if (s.usage.cost.total > 0) line += `  ${formatCost(s.usage.cost.total)}`;
      titleParts.push(`  ${mid}`);
      titleParts.push(`    ${line}`);
    }
  }

  if (ctx.hasUI) {
    return ctx.ui.select(titleParts.join("\n"), ["Done"]);
  } else {
    console.log(titleParts.join("\n"));
  }
}
