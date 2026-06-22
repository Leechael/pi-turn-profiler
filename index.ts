import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerTurnProfiler } from "./src/profiler.ts";

export default function turnProfilerExtension(pi: ExtensionAPI): void {
  registerTurnProfiler(pi);
}
