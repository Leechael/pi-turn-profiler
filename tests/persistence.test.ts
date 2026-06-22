import assert from "node:assert";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, before, after } from "node:test";
import { ensureTpsDir, writeTpsRecord } from "../src/persistence.ts";

function makeRecord(ts: string) {
  return {
    ts,
    model: "model-a",
    cwd: "/tmp",
    req: 1,
    tools: 0,
    out: 10,
    in: 5,
    cacheRead: 2,
    cacheWrite: 1,
    cacheHit: 28.6,
    total: 18,
    cost: 0.01,
    saved: 0.02,
    cacheWriteCost: 0.003,
    apiTps: 48.2,
    wallTps: 22.1,
    apiMs: 200,
    wallMs: 450,
    toolWallMs: 0,
    toolSumMs: 0,
  };
}

describe("persistence", () => {
  let agentDir: string;
  let previousAgentDir: string | undefined;

  before(() => {
    agentDir = mkdtempSync(join(tmpdir(), "pi-turn-profiler-persistence-"));
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
  });

  after(() => {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    rmSync(agentDir, { recursive: true, force: true });
  });

  it("creates the tps directory under the agent dir", () => {
    const dir = ensureTpsDir();
    assert.strictEqual(dir, join(agentDir, "tps"));
    const stat = statSync(dir);
    assert.ok(stat.isDirectory());
  });

  it("writes records grouped by day", () => {
    writeTpsRecord(makeRecord("2026-06-22T10:00:00.000Z"));
    writeTpsRecord(makeRecord("2026-06-22T11:00:00.000Z"));
    writeTpsRecord(makeRecord("2026-06-23T00:00:00.000Z"));

    const files = readdirSync(join(agentDir, "tps")).filter((f) => f.endsWith(".jsonl"));
    assert.deepStrictEqual(files.sort(), ["tps-2026-06-22.jsonl", "tps-2026-06-23.jsonl"]);

    const day22 = readFileSync(join(agentDir, "tps", "tps-2026-06-22.jsonl"), "utf8")
      .trim()
      .split("\n");
    assert.strictEqual(day22.length, 2);
    const parsed = JSON.parse(day22[0]);
    assert.strictEqual(parsed.model, "model-a");
    assert.strictEqual(parsed.req, 1);
  });
});
