import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface TpsRecord {
  ts: string;
  model: string;
  cwd: string;
  req: number;
  tools: number;
  out: number;
  in: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHit: number;
  total: number;
  cost: number;
  saved: number;
  cacheWriteCost: number;
  apiTps: number;
  wallTps: number;
  apiMs: number;
  wallMs: number;
  r429: number;
  r429Ms: number;
  toolWallMs: number;
  toolSumMs: number;
}

export function ensureTpsDir(): string {
  const dir = join(getAgentDir(), "tps");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function formatLocalDay(ts: string): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function writeTpsRecord(record: TpsRecord): void {
  const dir = ensureTpsDir();
  const day = formatLocalDay(record.ts);
  appendFileSync(join(dir, `tps-${day}.jsonl`), JSON.stringify(record) + "\n");
}
