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
  toolWallMs: number;
  toolSumMs: number;
}

export function ensureTpsDir(): string {
  const dir = join(getAgentDir(), "tps");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeTpsRecord(record: TpsRecord): void {
  const dir = ensureTpsDir();
  const day = record.ts.slice(0, 10);
  appendFileSync(join(dir, `tps-${day}.jsonl`), JSON.stringify(record) + "\n");
}
