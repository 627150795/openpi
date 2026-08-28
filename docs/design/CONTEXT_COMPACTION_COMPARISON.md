# Context Compaction Comparison

Status: research contract. This document compares context compaction and
context editing across the fixed implementations named by Issue #190, then
maps the useful boundaries back to OpenPI.

Comparison date: 2026-08-26. Source revisions and official documentation links
are fixed at the end of this document. They are evidence for this comparison,
not a promise that the upstream projects still behave identically today.

## Decision

OpenPI should not build a second automatic compressor. Ordinary parent and
child Session compaction remains Pi's responsibility. OpenPI's
`context_pivot` is an explicit phase transition that supplies a self-contained
brief to Pi's compaction lifecycle; it is not a replacement for Pi's normal
automatic, manual, or overflow compaction.

The most useful future work is narrow Pi/OpenPI hardening:

- an explicit first-class full-pivot cut rather than an implementation trick;
- summary provenance and safe redaction boundaries;
- bounded evidence for compaction effectiveness and repeated overflow;
- exact artifact plus bounded projection for OpenPI-owned results;
- focused tests for branch, fork, replay, cancellation, and concurrent append.

The comparison does not justify copying another harness's policy plane,
private provider protocol, global memory store, or opaque compaction format.

## 1. Terminology

### Context window

The model-visible input, output reservation, and provider-specific budget for a
request. It is not the size of a Session file or the total historical token
consumption.

### Summary compaction

A lossy operation that replaces older conversation history with a successor-
oriented summary and usually retains a recent tail. The original history may
remain durable even when it is no longer active model context.

### Deterministic pruning or context editing

Deletion or replacement of selected high-volume content such as old tool
results, thinking blocks, images, or tool inputs without asking a model to
summarize the whole history.

### Opaque server compaction

A provider returns an encrypted or otherwise unreadable item that the client
must preserve and replay as canonical state. It is not a normal text summary.

### Context pivot

An explicit caller-directed phase change. OpenPI asks Pi to install a concise
brief and deliberately discard the active old phase from the next context. The
Session history and its persistence owner remain Pi's.

### Artifact projection

Exact content is retained outside active context and a bounded head/tail,
summary, or reference is shown to the model. A projection is not proof that the
omitted content was semantically preserved.

## 2. Evidence policy

Every statement in this comparison belongs to one of these categories:

| Category | Meaning |
| --- | --- |
| Source fact | Directly visible in the pinned source revision or test |
| Official behavior | Stated in an official product/provider document |
| Runtime observation | Captured from a controlled invocation and receipt |
| Correlation | A measurement consistent with a hypothesis, but not proof |
| Inference | A reasoned design interpretation |
| Unknown | Not established by the available source or documentation |

In particular:

- a shorter prompt does not prove better recall;
- a cache-read counter does not prove which visible prefix was reused;
- a latency change does not prove a cache hit or a summary quality change;
- a provider's opaque item cannot be described as an ordinary readable summary;
- a source comment that disagrees with executable code is not current behavior
  evidence.

## 3. Fixed comparison set

| System | Revision or documentation scope | Main class |
| --- | --- | --- |
| OpenPI | `2a69d3f32994da4123f1312b7fa84ef3d6119be1` | Pi-native Session plus explicit `context_pivot` |
| Pi Coding Agent | `v0.84.3`, source commit `4e58f324fae8ebfa98a3d45181fb248072a2afac` | Local summary compaction |
| OpenAI Codex CLI | `da4cf1cdeaf8fb44a18bb75fd8df0094097f90b8` | Local and remote replacement state |
| Hermes Agent | `cbd8de8ad64530be01efea23b7764d5c37c634ed` | Multi-stage local compression and recovery |
| xAI Grok Build | `c2ad97f87aea4303b6000a2c22128bc91ee76c9b` | Checkpoint, rewind, preflight, and suppression |
| OpenAI Responses API | Official compaction documentation | Opaque server-side compaction |
| xAI API | Official context-compaction documentation | Opaque server-side compaction |
| Anthropic API and Claude Code | Official current documentation | Summary compaction and deterministic editing |
| Gemini CLI | `812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8` | Split summary, truncation, verification |
| OpenCode | `8615731d46153dd29b89e205fb55b2cc16205cb0` | Prune plus durable summary marker |

## 4. OpenPI and Pi ownership

### 4.1 Pi's native compaction

At the fixed Pi version, the main trigger is approximately:

```text
contextTokens > contextWindow - reserveTokens
```

The documented defaults are:

- `reserveTokens = 16,384`;
- `keepRecentTokens = 20,000`;
- compaction enabled by default.

Pi exposes three normal entry paths:

1. manual `/compact [instructions]`;
2. a threshold check after an assistant run;
3. bounded overflow recovery after a provider reports context overflow.

Pi chooses a safe cut point rather than simply retaining the last N messages.
Tool-call/result groups are not split arbitrarily. If one turn is larger than
the recent budget, split-turn handling puts the older portion in the summary
and retains a valid suffix.

### 4.2 Persistence and branches

Pi keeps an append-only Session tree. Compaction adds a compaction entry with
summary, first-kept identity, token accounting, and details; it does not
physically erase the old entries. The active branch is reconstructed from the
compaction entry and its retained tail. Branch navigation and compaction are
related but separate operations.

This is a strong source-of-truth boundary for OpenPI: an extension can provide
summary instructions through a hook, but it should not replace Pi's history
store or implement a second branch graph.

### 4.3 OpenPI `context_pivot`

OpenPI's `context_pivot` is parent-only and requires at least approximately
30,000 measured context tokens. The caller supplies a brief containing the next
goal, current state, decisions, blockers, failed paths, artifact paths, and
next steps. The extension attaches that brief to Pi's
`session_before_compact` event, asks Pi to compact, and continues from the new
phase.

The extension does not add a second threshold compressor. Its deliberate
full-cut behavior currently relies on a synthetic retained-entry identity so
the resulting active context is the brief plus later messages. That is an
effective compatibility technique, but not a first-class Pi contract. The
long-term fix belongs upstream: a supported `retain: none` or equivalent
full-pivot primitive with validation, persistence, branch, and failure
semantics.

### 4.4 What OpenPI must keep separate

| Mechanism | Purpose | Owner |
| --- | --- | --- |
| Session compaction | Replace old conversational context | Pi |
| `context_pivot` | Explicit phase brief and full active-context cut | OpenPI request, Pi lifecycle |
| Child result projection | Keep parent context bounded while retaining exact output | Subagent/Workflow owner |
| Workflow handoff | Pass bounded upstream results to another workflow agent | Workflow |
| Durable artifact | Preserve exact output or evidence | Producing extension |

These mechanisms can cooperate, but a global OpenPI compressor would blur
their authority and recovery guarantees.

## 5. Pi Coding Agent

Pi's design is the simplest strong baseline for OpenPI.

### Trigger and cut

- threshold is based on context window minus output reserve;
- manual and overflow paths share the compaction lifecycle;
- cut points respect user/assistant/tool turn structure;
- a large single turn can be split without leaving an invalid tool pair.

### Summary and persistence

The summary is continuation-oriented: goal, constraints, progress, decisions,
next steps, and relevant file changes. The old history remains in the Session
tree, while a compaction entry determines the active projection.

### Strengths

- one clear lifecycle owner;
- append-only and branch-friendly history;
- correct tool-group and split-turn boundaries;
- easy manual and automatic semantics;
- extension hooks without requiring an extension-owned history store.

### Gaps worth upstreaming

- first-class full-pivot cut;
- stronger summary provenance and redaction evidence;
- explicit concurrent-append watermark semantics;
- anti-thrashing evidence when a compacted context immediately overflows again.

## 6. OpenAI Codex CLI

Codex has local summary compaction, legacy remote compaction, and a newer
remote-v2 path. The fixed source shows more than one replacement protocol,
which gives it richer state but also more mode-specific behavior.

### Useful patterns

- sampling-time checks can respond to model or context-window changes;
- local compaction preserves a bounded recent user tail;
- local summary generation can reduce its input and retry on overflow;
- remote replacement can carry structured compacted state and window identity;
- runtime world state and turn context can remain separate from the compacted
  conversation item.

### Tradeoffs

The local, remote, and remote-v2 paths differ in which reasoning and tool state
they retain. Opaque remote state depends on the Codex backend and is not a
portable OpenPI Session format. Operators may not know from the UI which mode
performed the compaction.

### OpenPI lesson

Replacement state is useful when the provider owns it, but an OpenPI extension
should not invent a provider-private compacted item. Keep provider-specific
state in the Pi/provider adapter and keep OpenPI artifacts readable and
auditable.

## 7. Hermes Agent

Hermes treats compression as a recovery subsystem rather than a single summary
call.

### Trigger and stages

The fixed source combines an agent-level threshold with a gateway safety net,
manual compression, idle-resume behavior, and provider-native paths for some
models. Its multi-stage flow can:

1. remove stale or duplicate tool output and oversized arguments;
2. protect system/head anchors and important user content;
3. generate a rolling summary;
4. retain a verbatim tail and repair orphan tool pairs.

### Recovery-oriented features

The lean path preserves exact identifiers such as paths, PRs, SHAs, and error
strings, while exposing a search/recovery pointer for omitted material. The
source also contains provider fallback, retry/cooldown, anti-thrash counters,
redacted fallback, summary provenance, and watermark handling for concurrent
appends.

### Tradeoffs

This is the strongest comparison point for exact recovery and failure
classification, but the policy surface approaches a second orchestration
subsystem. Tail modes, provider routes, thresholds, and fallback choices can
combine into a large behavior matrix.

### OpenPI lesson

Borrow exact artifact references, provenance, and failure categories for
OpenPI-owned result channels. Do not copy a complete Hermes policy plane into
the Pi-native Session path.

## 8. xAI Grok Build

Grok Build combines compaction with checkpoint/rewind and request preflight.
The fixed source distinguishes a pre-request trigger, tool-output preflight,
explicit `/compact`, overflow recovery, and sticky suppression after repeated
failure.

### Useful patterns

- checkpoint and rewind make an exploration path recoverable without requiring
  a summary to preserve every exact detail;
- preflight can compact before a request rather than waiting for provider
  rejection;
- two-pass or prefire behavior can preserve a recent verbatim segment;
- error classification and suppression reduce immediate retry loops.

### OpenPI lesson

Checkpoint/rewind and Session compaction solve different problems. A checkpoint
does not undo provider calls or external effects, and a context summary does not
create a recoverable exploration branch. OpenPI should keep those contracts
separate.

## 9. OpenAI Responses API

The Responses API exposes server-side compaction as an opaque compaction item.
It supports automatic context management and a standalone compact operation.

### Contract

- automatic mode can compact during a response stream when a threshold is
  crossed;
- standalone compaction returns canonical next-window state;
- the client must preserve the output item as provider state, not rewrite it as
  a text summary;
- `previous_response_id`, Conversations, and stateless chaining have different
  storage and retention semantics;
- the provider's token accounting is authoritative for its own request.

### Tradeoffs

Opaque state can preserve provider-specific reasoning or hidden context that a
readable summary cannot express. It is not directly auditable, editable,
portable across models, or suitable as an OpenPI-owned plain-text Session
entry. It must also be protected as sensitive durable state.

### OpenPI lesson

If Pi later supports provider-native opaque state, the provider adapter owns
its canonical persistence and replay rules. OpenPI should expose only bounded
receipts and should not decode or normalize the blob.

## 10. xAI Compaction API

The xAI API similarly returns a provider-owned compaction block or canonical
compacted state. The client must preserve the provider-defined item and obey
its model and context limits.

The important comparison is not the exact wire shape but the ownership rule:
server-native compaction is a provider protocol, not a general-purpose local
summary. A client can record that the provider returned a compacted item; it
cannot infer its internal contents, retention, cross-model compatibility, or
cache behavior.

## 11. Anthropic API and Claude Code

Anthropic exposes summary compaction and deterministic context editing as
separate mechanisms.

### Summary compaction

The client can request compaction after a threshold, optionally pause after the
compaction block, and append recent messages before continuing. Compaction
usage can be accounted separately from ordinary message iterations.

### Deterministic editing

The context-management features can clear old tool uses and thinking blocks
without asking the model to summarize everything. The client retains the
original history while the provider edits the rendered request and reports
applied edits.

### OpenPI lesson

Old tool output is often the cheapest deterministic recovery target. Semantic
summary should preserve decisions and task state; pruning should remove data
that can be safely reacquired or read from an artifact. These are different
contracts and should not be hidden behind one “compact” status.

Claude Code's full implementation details are not open source. Claims about
its exact cut points, atomic persistence, or retry state remain documented
behavior or unknown, not source facts.

## 12. Gemini CLI

Gemini CLI uses a comprehensible split-and-verify strategy.

### Trigger and split

- compression preflight runs around normal turns;
- a default threshold is expressed as a fraction of the model token limit;
- the service selects a split near a summary/recent-tail ratio;
- the cut avoids dangling function calls and responses.

### Tool output handling

Oversized function responses can be moved to a temporary file and represented
by a truncation marker. This resembles an artifact projection, but the
temporary file's retention, permission, crash cleanup, and resume semantics
must be treated separately.

### Verification

The service asks for a state snapshot and performs a second verification pass
for paths, constraints, tool results, and technical details. If a summary is
empty or fails to reduce context, deterministic truncation may be accepted on
some paths.

### OpenPI lesson

Cut correctness and explicit status values are useful. A second model call can
improve recall but adds cost and latency; OpenPI should benchmark that tradeoff
before adding it to a Pi-native path.

## 13. OpenCode

OpenCode clearly separates deterministic pruning from semantic summary
compaction.

### Pruning

The fixed source protects recent user turns and selected skills, retains only a
bounded amount of recent tool output, and persists a pruning marker only when
the predicted recovered space is meaningful. Prune failures are less visible
than they should be.

### Summary compaction

The compaction agent is tool-denied. A durable marker records the start of the
retained tail, and resume reconstructs the summary plus that tail. Overflow
handling can preserve the latest user request and replace removed media with an
explicit notice.

### OpenPI lesson

Tool-denied summarization, durable tail identity, and a clear distinction
between prune and summary are worth borrowing. Plugin-controlled prompts and
provider-specific limits still require provenance and should not become an
OpenPI global policy.

## 14. Cross-implementation comparison

### 14.1 Trigger strategy

| System | Main trigger | Design implication |
| --- | --- | --- |
| Pi | Context window minus output reserve | Simple and predictable output headroom |
| Hermes | Route/model threshold plus safety net | Strong recovery, larger policy surface |
| Codex | Window, model/config transition, and mode-specific checks | Rich replacement state, more divergence |
| Grok | Threshold, preflight, explicit compact, overflow | Early prevention plus suppression |
| Gemini | Fraction of model limit | Easy to understand, less exact if estimated by characters |
| OpenCode | Usable capacity plus provider overflow | Pruning can precede expensive summary |
| OpenAI/xAI API | Provider threshold or explicit compact endpoint | Provider owns canonical opaque state |
| Anthropic | Compaction threshold plus editing triggers | Summary and deterministic deletion are separate |

A fixed percentage is not a universal abstraction. A sound trigger must account
for output reserve, summary-input fit, model changes, reasoning budget,
provider errors, and whether safe deterministic pruning can recover enough
space first.

### 14.2 Summary representation

| Representation | Systems | Main tradeoff |
| --- | --- | --- |
| Readable continuation summary | Pi, Hermes, Gemini, OpenCode, Anthropic | Auditable and portable, but summary quality is lossy |
| Structured replacement state | Codex | Rich recovery, but mode/backend-specific |
| Opaque encrypted/provider item | OpenAI and xAI APIs | Preserves private provider state, but is not auditable or portable |
| Deterministic placeholder/edit | Anthropic, OpenCode, Gemini | Predictable and cheap, but not semantic recall |

OpenPI should prefer readable, auditable summaries for its own contracts and
keep provider-native opaque state at the Pi/provider boundary.

### 14.3 Preserved tail and tool grouping

- Pi uses token-aware backward cuts and split-turn handling;
- Hermes uses protected anchors, tool grouping, and selectable tail modes;
- Codex local mode preserves a bounded user tail while remote modes use richer
  retained state;
- Grok can use a second pass to preserve a recent verbatim prefix;
- Gemini avoids dangling function-call/response pairs;
- OpenCode records a durable tail start marker;
- Anthropic can pause after compaction so the client appends recent messages.

The shared lesson is that the last N messages is not a safe algorithm. Tool
call/result grouping, user constraints, current task state, and output reserve
must be considered explicitly.

### 14.4 Persistence and recovery

| System | Durable representation | Recovery boundary |
| --- | --- | --- |
| Pi | Append-only Session tree and compaction entry | Branch-aware reconstruction |
| Hermes | Soft-archived session plus searchable/indexed recovery | Same session with exact anchors |
| Codex | Compacted replacement plus independent world/turn state | Mode/backend-specific resume |
| Grok | Checkpoint/rewind and replacement state | New exploration path or compacted request |
| Gemini | Recording plus temporary tool-output files | File/recording policy dependent |
| OpenCode | Durable compaction marker and tail identity | Resume rebuilds marker plus tail |
| OpenAI/xAI APIs | Canonical opaque provider item | Provider protocol only |
| Anthropic | Client history plus rendered edits/summary | Client/provider contract |

OpenPI's current Pi source of truth is the right default. Exact OpenPI-owned
results should use artifact references rather than rewriting Pi conversational
history.

### 14.5 Prompt caching

Compaction usually changes the conversation prefix at the cut point. The
relevant optimization is not keeping an overlarge old prefix forever, but
forming a stable new prefix quickly:

- keep stable system and tool definitions separately cacheable where the
  provider supports it;
- avoid changing tool schema because a child started or settled;
- prune only when the recovered space justifies invalidation;
- treat a new summary or branch as a new request identity unless the provider
  says otherwise;
- never infer cache sharing between parent and child from similar IDs.

Cache read/write fields, latency, and cost must be reported with their provider
and request scope. They are not a portable cross-harness metric by default.

### 14.6 Failure and anti-thrashing

| Pattern | Strong example | OpenPI implication |
| --- | --- | --- |
| Bounded overflow retry | Pi | Retry once with a clear terminal outcome |
| Provider fallback/cooldown | Hermes | Useful only with explicit failure classes and policy bounds |
| Sticky suppression | Grok | Stop repeated low-value compactions |
| Verification or truncation fallback | Gemini | Separate summary failure from deterministic recovery |
| Prune before summary | OpenCode/Anthropic | Recover cheap space before expensive model work |
| Opaque server result | OpenAI/xAI | Preserve provider item exactly; do not parse as text |

The minimum useful evidence is trigger reason, tokens before, estimated tokens
after, retained-tail size, summary usage, failure class, and whether the next
request immediately overflowed again. Cancellation, authentication, quota,
invalid summary, persistence failure, and size failure must not all be reported
as a generic retryable error.

### 14.7 Security and trust

Every summarizer sees potentially hostile history: tool output, terminal text,
secrets, prompt injection, and external content. The safest baseline is:

- tool-denied summary generation;
- explicit summary provenance;
- redaction or exclusion for secret-bearing data;
- atomic persistence before claiming compaction success;
- exact source/artifact references where recall matters;
- protection of opaque provider items as sensitive durable state;
- no automatic external side effects during a recovery read.

Shorter context is not a security boundary. A summary can amplify an injected
instruction or omit the constraint that made a command unsafe.

## 15. Recommendation for OpenPI

### A. Keep one Session owner

Pi should continue to own automatic `/compact`, threshold checks, overflow
recovery, Session format, cut points, branch reconstruction, and compaction
hooks. OpenPI should keep only explicit `context_pivot` intent and feature
contracts that it actually owns.

### B. Upstream a full-pivot primitive

Replace the synthetic retained-entry technique with a Pi-supported operation
that can express “keep the summary and no old active entries”. The primitive
must define:

- non-empty, byte-bounded summary validation;
- parent/current Session authorization;
- atomic persistence or an explicit uncertain result;
- success, failure, cancellation, and interruption states;
- branch/fork/reload reconstruction.

### C. Add evidence before policy

Record trigger reason, before/after estimates, retained tail, summary usage,
failure class, and immediate re-overflow. If a compaction does not recover
meaningful space, stop rather than entering a retry loop.

### D. Use artifact projection for OpenPI-owned outputs

For child and Workflow outputs owned by OpenPI:

1. persist exact content in the owner artifact;
2. project a bounded head/tail, status, identity, and recovery reference;
3. let the model read exact content on demand;
4. retain artifact authority and lifecycle in the producing feature.

Do not apply this as a second global projection layer to every Pi tool result.

### E. Benchmark quality, not token reduction alone

A useful compaction benchmark should measure:

- goal and constraint recall;
- exact path, symbol, SHA, issue, PR, and error-string recall;
- completed versus pending work;
- failed approaches worth avoiding;
- tool-call/result pairing;
- repeated-compaction information decay;
- cache usage, latency, and cost with provider scope;
- adversarial tool output and prompt injection resilience;
- resume, branch, fork, and concurrent-follow-up correctness.

Fixtures should include a single large turn, many tool calls, multiple
compactions, provider changes, a pending tool result, images/binary data, a
large log, and summary-model failure.

### F. Do not copy directly

- Hermes's entire compression policy plane;
- OpenAI/xAI private compacted-item protocols;
- fixed keyword-triggered pivot rules;
- a process-global context or memory store;
- a tool-capable summarizer in the normal execution path;
- a benchmark that reports only shorter context as success.

## 16. Acceptance checklist

- [ ] Pi remains the normal Session compaction owner.
- [ ] `/compact`, automatic threshold, overflow recovery, `context_pivot`,
  branch summary, and result projection are distinguished.
- [ ] Trigger, cut, tool-group, tail, persistence, cache, and failure behavior
  is compared for each fixed implementation.
- [ ] Source facts, official behavior, observations, inference, and unknowns
  are not conflated.
- [ ] Server-side opaque items are not described as readable summaries.
- [ ] Deterministic pruning is not described as semantic compaction.
- [ ] Provider-specific reasoning and cache state are not generalized.
- [ ] OpenPI recommendations do not create a second compressor or global store.
- [ ] Future runtime work is gated by a quality benchmark and failure evidence.

## Sources

OpenPI and Pi:

- https://github.com/tt-a1i/openpi/tree/2a69d3f32994da4123f1312b7fa84ef3d6119be1
- https://github.com/tt-a1i/openpi/blob/2a69d3f32994da4123f1312b7fa84ef3d6119be1/extensions/context-pivot/index.ts
- https://github.com/earendil-works/pi/tree/v0.84.3
- https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/docs/compaction.md
- https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/src/core/compaction/compaction.ts
- https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/src/core/agent-session.ts

Codex and Hermes:

- https://github.com/openai/codex/tree/da4cf1cdeaf8fb44a18bb75fd8df0094097f90b8
- https://github.com/openai/codex/blob/da4cf1cdeaf8fb44a18bb75fd8df0094097f90b8/codex-rs/core/src/compact.rs
- https://github.com/NousResearch/hermes-agent/tree/cbd8de8ad64530be01efea23b7764d5c37c634ed
- https://github.com/NousResearch/hermes-agent/blob/cbd8de8ad64530be01efea23b7764d5c37c634ed/agent/context_compressor.py
- https://github.com/NousResearch/hermes-agent/blob/cbd8de8ad64530be01efea23b7764d5c37c634ed/website/docs/developer-guide/context-compression-and-caching.md

Grok and API providers:

- https://github.com/xai-org/grok-build/tree/c2ad97f87aea4303b6000a2c22128bc91ee76c9b
- https://docs.x.ai/build/features/sessions
- https://docs.x.ai/developers/advanced-api-usage/context-compaction
- https://developers.openai.com/api/docs/guides/compaction
- https://developers.openai.com/api/docs/guides/conversation-state
- https://platform.claude.com/docs/en/build-with-claude/compaction
- https://platform.claude.com/docs/en/build-with-claude/context-editing
- https://code.claude.com/docs/en/context-window

Gemini and OpenCode:

- https://github.com/google-gemini/gemini-cli/tree/812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8
- https://github.com/google-gemini/gemini-cli/blob/812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8/packages/core/src/context/chatCompressionService.ts
- https://github.com/anomalyco/opencode/tree/8615731d46153dd29b89e205fb55b2cc16205cb0
- https://github.com/anomalyco/opencode/blob/8615731d46153dd29b89e205fb55b2cc16205cb0/packages/opencode/src/session/compaction.ts
- https://github.com/anomalyco/opencode/blob/8615731d46153dd29b89e205fb55b2cc16205cb0/packages/opencode/src/session/overflow.ts

Issue and contribution context:

- https://github.com/tt-a1i/openpi/issues/190
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/CONTRIBUTING.md