# pi-turn-profiler

**Real-time LLM turn profiler for Pi.** Tracks tokens per second, cache efficiency, cost, and tool execution time — live during streaming, summarized per turn, and persisted daily.

## Why this exists

Pi is an agentic coding harness where every turn involves multiple provider requests, tool calls, and parts whose timing you normally only feel subjectively ("this took long"). This extension makes those numbers visible, actionable, and persistent.

**You do not have to remember what a session cost or whether caching is working.** The profiler surfaces:

- **Real-time TPS during streaming** — so you know whether the model is still generating or stalled before the first token arrives.
- **API TPS vs wall TPS** — API TPS measures only the model response time (what the provider charges you for). Wall TPS includes tool execution, so you can see how much of a turn is spent on tools vs. the model.
- **Tool execution breakdown** — summed tool time (what you'd save if tools were faster) vs. wall tool time (how long the user actually waited for tools).
- **Per-turn cost** with cache savings — shows what the cache saved you in real dollar terms, not just token counts.
- **Per-model session stats** — when you switch models mid-session, each model's performance is tracked independently.
- **Persistent daily records** — every turn is written to `~/.pi/agent/tps/tps-YYYY-MM-DD.jsonl` so you can audit, aggregate, or forward to your own analytics.

## What this package adds

- Real-time TPS indicator in the working message area during streaming (updates every 0.5s).
- Per-request notification with output tokens, cache hit percentage, and cost.
- Per-turn summary notification with TPS, tokens, cache, timing, and cost.
- API TPS (`tok/s`) — tokens per second measured against provider response time only.
- Wall TPS (`tok/s`) — tokens per second measured against total turn wall time.
- Tool execution tracking: number of tool calls, wall time (concurrent tools overlap), sum time (serial equivalent).
- Response wait time — time from request start to the provider's first response, before the stream is consumed.
- Cache hit ratio with color-coded severity: green >= 80%, yellow >= 50%, red < 50%.
- Cache savings in dollars — estimates what cache reads saved vs. paying the input rate.
- Per-model session statistics aggregated in memory.
- Daily JSONL records at `~/.pi/agent/tps/tps-YYYY-MM-DD.jsonl`.
- `/tps` command for a detailed overlay of last task + per-model session stats.
- No build step; Pi loads the TypeScript extension directly.

## Install

### Local development

```bash
pi -e /path/to/pi-turn-profiler
```

### Install from GitHub Release tarball

Download the tarball from the [latest release](https://github.com/Leechael/pi-turn-profiler/releases/latest), extract it, and install from the local path:

```bash
curl -L https://github.com/Leechael/pi-turn-profiler/releases/latest/download/pi-turn-profiler.tar.gz | tar -xz -C /tmp
pi install /tmp/pi-turn-profiler
```

## Usage

Once loaded, the extension automatically hooks into every agent turn. No commands are needed to start profiling.

### What you see

**During streaming**, after 0.5 seconds of generation, the working message area shows a live TPS indicator. While provider usage is unavailable mid-stream, this live number is an estimate; completed request and task summaries use reported output tokens.

```
● 45.2 tok/s
```

**After each request** (one assistant message), a notification shows:

```
#1 1,234 out  cache 67.3%  $0.0210
```

- `#1` — request number within the current agent task.
- `out` — output tokens generated.
- `cache %` — cache hit ratio (cached input / total input). Colored: green >= 80%, yellow >= 50%, red < 50%.
- Cost shown when the provider reports it.

**After each agent task** (a full turn, potentially with multiple requests if tools ran), a summary notification appears:

```
req 1  cache 67.3%  $0.0210  45.2 tok/s  12.3s  anthropic/claude-sonnet-4
```

### The `/tps` command

Run `/tps` to open a detailed overlay showing the last task's full breakdown and per-model session statistics:

```
Last Task
  TPS   45.2 tok/s API  30.1 tok/s wall  anthropic/claude-sonnet-4
  Token out 1,234  in 5,678  total 6,912
  Cache r 3,800 / w 200  hit 66.9%
  Cost  $0.0210  saved $0.0035
  Time  api 12.3s  wait avg 1.2s  wall 18.5s
  Exec  req 1  tools 3  tool wall 8.2s  tool sum 6.5s

Session by model
  anthropic/claude-sonnet-4
    req 5  out 6,120  cache 71.2%  55.1 tok/s  $0.0950
```

### In non-TUI mode (headless / piped)

Summary and request notifications go to `console.log`. The `/tps` command prints directly to stdout.

## Metrics explained

### TPS: API TPS vs Wall TPS

**API TPS** = output tokens / provider response time. This measures how fast the model generates tokens, excluding tool execution time. It is the number that reflects model/provider performance.

**Wall TPS** = output tokens / total turn wall time. This includes everything: provider requests, tool execution, interleaved UI work. It is the number that reflects user-perceived speed.

If API TPS is high but Wall TPS is low, tools are the bottleneck. If both are low, the model/provider is slow or the output is short.

### Tool execution: tool wall vs tool sum

**Tool wall** — the wall-clock duration from the start of the first tool to the end of the last tool. If tools ran concurrently, this is shorter than the sum.

**Tool sum** — the sum of individual tool durations. If tools ran concurrently, this is longer than the wall time, and the difference tells you how much overlap you got.

### Cache hit ratio

`cacheRead / (input + cacheRead) * 100`. This is the percentage of input tokens that were served from cache rather than charged as fresh input.

Color coding: green (>= 80%), yellow (>= 50%), red (< 50%).

### Cache savings

`cacheRead * inputRate - cacheReadCost`. This estimates how much the cache saved you in dollar terms: what you would have paid for those cache-read tokens at the input rate, minus what you actually paid for them at the (cheaper) cache read rate. Only shown when the provider reports per-component costs.

### Response wait time

Time from `before_provider_request` to `after_provider_response`. This is the provider's first response timing, closer to time-to-first-byte (TTFB) than strict time-to-first-token (TTFT).

## Persistent records

Every turn is appended to a daily JSONL file at:

```
~/.pi/agent/tps/tps-YYYY-MM-DD.jsonl
```

Each record contains the full numeric breakdown:

```json
{
  "ts": "2026-06-20T10:30:00.000Z",
  "model": "anthropic/claude-sonnet-4",
  "cwd": "/Users/me/my-project",
  "req": 3,
  "tools": 5,
  "out": 2456,
  "in": 8921,
  "cacheRead": 3400,
  "cacheWrite": 500,
  "cacheHit": 38.1,
  "total": 12377,
  "cost": 0.0421,
  "saved": 0.0032,
  "cacheWriteCost": 0.0005,
  "apiTps": 48.2,
  "wallTps": 22.1,
  "apiMs": 51200,
  "wallMs": 111200,
  "toolWallMs": 42300,
  "toolSumMs": 56100
}
```

Use this data for historical aggregation, cost allocation, or forwarding to your own observability pipeline. The `cwd` field lets you attribute costs to projects.

## Session stats

In-memory per-model aggregation resets when Pi restarts. Each model seen during the session appears under "Session by model" in `/tps`, with cumulative request count, output tokens, cache hit rate, average API TPS, and total cost.

## Development

```bash
npm install
npm run check   # TypeScript
npm run test    # Node built-in test runner
npm run lint
npm run format
```

Tests live in `tests/` and use Node's built-in `node:test` runner (no Jest or Vitest dependency).

### Project structure

```
pi-turn-profiler/
  index.ts          # Entry point: hooks into Pi lifecycle events
  src/
    util.ts         # Formatting, accounting, state types
  tests/
    util.test.ts    # Unit tests for util functions
```

## Troubleshooting

### No TPS indicator appears during streaming

The indicator activates after 0.5 seconds of continuous generation. Very short responses may not trigger it. Check that the extension is loaded: run `/tps` and verify it responds.

### `/tps` shows "No TPS measurement yet"

No agent turn has completed since the extension loaded (or since the last Pi restart). Run a normal conversation turn, then try again.

### The cost field is always $0

Not all providers report per-token cost in the usage object. The profiler only shows cost-related fields when `usage.cost.total > 0`.

### "Session by model" shows no data

Session stats reset when Pi restarts. They accumulate during a session. Run several turns first.

### JSONL records are empty or missing

Check that `~/.pi/agent/tps/` is writable. Permission issues or disk-full conditions are shown as TUI error notifications, or logged to stderr with a `[pi-turn-profiler]` prefix outside TUI mode.

### Cache savings seems too high or too low

The savings calculation estimates what cache reads would have cost at the input rate and subtracts what was actually charged for them. This is an estimate: it assumes the input rate is uniform across all input tokens, which may not be true for all provider pricing models.

## References

- Pi: [earendil-works/pi](https://github.com/earendil-works/pi)
- Extension API: [Pi extensions docs](https://github.com/earendil-works/pi/blob/main/docs/extensions.md)

## License

MIT
