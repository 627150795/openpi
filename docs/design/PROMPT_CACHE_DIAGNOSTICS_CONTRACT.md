# Per-turn prompt-cache diagnostics contract

Status: proposed research/design for [Issue #156](https://github.com/tt-a1i/openpi/issues/156). This document does not change runtime behavior.

## Problem

`extensions/model-info/index.ts` currently aggregates `cacheRead` over the
active branch and the footer displays one cumulative percentage. That is useful
as a trend, but it cannot answer which turn stopped reusing a prefix.

The missing diagnostic must remain provider-aware. A zero `cacheRead` value can
mean a real rewrite, an implicit provider-cache miss, an unavailable usage
field, or a normal first/cold turn. It must not be reported as one fact.

## Decision

Start with a pure trace classifier and an operator-facing report. Do not add a
default footer marker, transcript text, model instruction, or provider adapter
until replay evidence shows that the classifier is useful and has a tolerable
false-positive rate.

The existing cumulative cache percentage remains the trend metric. Per-turn
diagnostics are an additional, opt-in explanation layer.

## Vocabulary and evidence

Every diagnostic distinguishes three evidence levels:

| Level | Meaning | Example |
| --- | --- | --- |
| Observation | A value reported by Pi/provider usage or a local lifecycle event | `cacheRead = 0` |
| Correlation | A local event near the usage change | tool schema changed before the turn |
| Verified cause | A provider-authoritative explanation or deterministic local proof | explicit prefix rewrite was reported |

Correlation is never upgraded to verified cause merely because it happened
first. If the evidence is incomplete, the result is `unknown`.

A future trace input needs only the facts available at the boundary being
classified:

```ts
type CacheMode = "explicit-prefix" | "implicit-best-effort" | "unknown";

interface CacheTurnObservation {
  turnId: string;
  provider: string;
  modelId: string;
  cacheMode: CacheMode;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  prefixRewriteObserved: boolean | null;
  boundary:
    | "normal"
    | "compaction"
    | "branch"
    | "model-change"
    | "tool-change"
    | "unknown";
}
```

This is a proposed test/trace shape, not a promise that all providers expose
all fields.

## Classification rules

The classifier must be conservative:

1. Missing, negative, inconsistent, or non-authoritative usage is
   `unknown`.
2. The first turn is `first-turn`; it is not a cache miss.
3. A turn with a positive cache read is `warm` unless the provider supplies a
   more specific, authoritative status.
4. A partial read is `partial-hit` only when the expected reusable prefix is
   known. Otherwise it is `warm` plus an uncertainty note.
5. A `warm -> cacheRead = 0` transition is eligible for invalidation analysis
   only when the previous turn read at least 2,048 cache tokens.
6. The transition is `invalidation-observed` only for an explicit-prefix
   provider with `prefixRewriteObserved = true`.
7. The same transition for an implicit or unknown cache mode is `unknown`, not
   a miss marker. A local model/tool/compaction/branch change may be reported
   as correlation only.
8. Consecutive cold turns, an ineligible previous turn, or an incomplete trace
   are `unknown`/`not-comparable`; they do not create repeated invalidation
   events.

The 2,048-token threshold is a detector guard against calling tiny or
uninitialized prefixes “warm.” It is a testable constant, not a provider fact.

## Provider boundary

Provider policy is explicit data, not a string heuristic:

- **Explicit prefix cache**: a provider may support verified rewrite evidence;
  the detector may classify an invalidation only when the trace includes that
  evidence.
- **Implicit best-effort cache**: usage can support observations and trends,
  but ordinary propagation/TTL behavior cannot be called an invalidation.
- **Unknown or mixed semantics**: expose the observation and return
  `unknown` for the explanation.

The detector reports Pi’s authoritative usage fields. It does not estimate a
provider bill, infer hidden cache state, or claim that an operator/model action
caused the change.

## Required replay matrix

The pure classifier needs fixtures for at least:

| Trace | Expected result |
| --- | --- |
| first turn | `first-turn` |
| warm to warm | no invalidation |
| eligible warm to zero with explicit rewrite | `invalidation-observed` |
| eligible warm to zero without rewrite evidence | `unknown` |
| eligible warm to zero on implicit cache | `unknown` |
| cold to cold | no repeated marker |
| partial read with known expected prefix | `partial-hit` |
| compaction or branch boundary | boundary is reported; cause stays unverified |
| model or tool change | correlation only unless provider verifies it |
| missing/inconsistent usage | `unknown` |

Replay should include representative OpenPI, Bare Pi, and OMP traces. It must
measure false positives, false negatives, incomplete-trace handling, and the
cost of retaining the existing cumulative metric.

## Output and lifecycle

The first implementation should be a pure function plus a bounded trace
report. The report is operator-facing and disabled by default:

- no diagnostic is injected into model context;
- no diagnostic changes tool discovery, model choice, thinking level, or
  workflow behavior;
- no transcript marker is emitted before replay validation;
- session compaction and branch moves reset comparability rather than inventing
  continuity;
- the report states `observation`, `correlation`, and `verified cause`
  separately.

Only after the replay results are credible should an opt-in `/model-info`
detail or transcript marker be considered. Such a marker must preserve
`unknown` and must not replace the cumulative cache percentage.

## Non-goals

- Guaranteeing that a provider cache will hit.
- Treating every `cacheRead = 0` as an error or user-caused miss.
- Automatically changing models, thinking, tools, or context.
- Adding a provider adapter or a second cache-accounting source.
- Making per-turn token details visible in ordinary sessions by default.

## Delivery gate

1. Implement the classifier as a small pure module with replay tests.
2. Validate it against real, redacted traces from the required matrix.
3. Publish observed false-positive/false-negative limits.
4. Only then decide whether an opt-in UI/report is worth its static and
   interaction cost.

Until those gates pass, a docs/design contract is the complete safe change for
this issue; it does not claim that runtime observability is implemented.