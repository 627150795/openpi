# Prompt Cache Ownership and Lifecycle Contract

Status: documentation contract. This document records prompt/KV cache
ownership, request identity, accounting, invalidation, retention, child/fork
behavior, replay boundaries, and observability limits.

It does not build an OpenPI cache manager, persist hidden KV state, create a
provider-neutral cache API, or infer provider internals from latency, labels,
keys, or session ids.

## Decision

Prompt caching is provider-side reuse of computation for an eligible request
prefix. It is not the same as:

- Session context continuity;
- durable memory or retrieval;
- compaction or summarization;
- deterministic tool-output pruning;
- Workflow or Subagent replay;
- a model response cache.

Ownership remains:

| Concern | Owner |
| --- | --- |
| Session messages, branches, compaction, and replay | Pi Session |
| Provider-specific cache controls and usage normalization | pi-ai/provider adapter |
| OpenPI capability/tool policy and child projection | OpenPI extension layer |
| Cumulative model-info display | OpenPI model-info projection |
| Per-turn invalidation research and opt-in diagnostics | Issue #156 |
| Cumulative metric collection/redesign | Issue #188 |
| Hidden cache storage, eviction, encryption, and physical KV layout | Provider |

The same request can have context continuity without a cache hit, or a cache
hit without a durable Session continuation. A replayed result can avoid a
provider request entirely and must never be reported as a cache hit.

## 1. Taxonomy

### 1.1 Prompt/KV caching

Prompt/KV caching reuses provider-side computation for an exact or
provider-equivalent request prefix. A useful conceptual prefix is:

~~~text
provider/account/route
+ model and compatible request options
+ system/developer instructions
+ tool definitions and ordering
+ early conversation messages
+ provider cache markers, breakpoints, or affinity hints
~~~

The actual key, partition, retention, eviction, encryption, and server
serialization are provider-owned unless an explicit public contract says
otherwise.

There are three observed forms:

1. Automatic prefix caching: the provider decides whether an eligible prefix
   can be reused.
2. Explicit markers or breakpoints: the client marks cacheable prefix
   boundaries.
3. Explicit cache resources: the client creates or references a named provider
   cache object.

A prompt_cache_key, affinity header, cache marker, cache resource name, or
stable Session id is an input or hint. None proves that an entry exists or
that the current request hit it.

### 1.2 Context state

Context state is the messages and runtime state used to construct the next
request. It can be:

- locally replayed Session history;
- a server response chain;
- a provider conversation object;
- a persisted CLI Session;
- a child or branch projection.

Context state answers what the client intends to send. It does not answer
whether the provider reused computation for any prefix.

### 1.3 Memory and retrieval

Memory is durable or selectively injected information outside the immediate
transcript, including project instructions, Skills, retrieved records, and
user/project memory.

Memory affects cache identity only when it changes provider-visible request
content or request options. A stable Session id does not make changed memory
cache-neutral.

Durable memory remains owned by Issue #167. This contract only describes its
possible effect on a request prefix.

### 1.4 Compaction, pruning, summarization, and replay

These are separate mechanisms:

| Mechanism | Effect | Cache interpretation |
| --- | --- | --- |
| Compaction | Replaces older context with a summary or provider item | New request epoch unless provider contract says otherwise |
| Pruning | Removes or hides selected content, often old tool output | Request-shape change; not a cache hit |
| Summarization | Creates model-authored replacement context | New content; may invalidate an earlier prefix |
| Replay | Returns persisted execution output | Usually zero provider calls; not a cache hit |
| Prompt cache | Reuses eligible provider computation | Does not restore Session or semantic state |

## 2. Evidence policy

Claims use these levels:

- source fact: visible in a fixed client revision;
- documented contract: stated by a provider or product;
- client observation: captured at the provider boundary;
- correlation: two client events changed together;
- inference: an expected consequence of a prefix or lifecycle change;
- unknown: not established by available evidence.

Examples:

~~~text
cacheRead > 0
  -> provider reported read tokens for this request

cacheRead = 0
  -> no reported read tokens

cacheRead = 0
  != proof of a cache miss
  != proof that a user action caused an invalidation
~~~

A cache percentage is a trend projection. It is not a causal diagnosis.

The following are not proof of a cache hit by themselves:

- low latency;
- a stable Session id;
- a stable prompt_cache_key;
- a cache marker or breakpoint;
- a long-retention option;
- a UI label;
- similar input/output token counts;
- reuse of a child or Workflow id.

The provider-reported read/write fields are stronger evidence than client
heuristics, but they still do not expose hidden physical cache state, server
routing, or the exact key construction unless the provider documents those
details.

## 3. OpenPI and Pi ownership

### 3.1 Request construction

OpenPI does not directly own provider cache controls. Pi constructs the
Session request and pi-ai/provider adapters translate compatible options and
usage fields for the selected provider.

The effective request prefix can include:

~~~text
system prompt
+ context files and resource projections
+ visible Skill names/descriptions
+ explicitly read Skill bodies
+ appended system instructions
+ active tool snippets and guidelines
+ serialized tool definitions
+ transcript messages
+ provider-specific request options
~~~

OpenPI capability activation can change the active tool surface. This may
change the prefix or tool definitions, but the cache consequence is an
inference until provider usage or a provider contract confirms it.

A child Session can share some text with its parent while still having a
different cache principal because its model, tools, working directory,
authority, resource loader, system text, or request options differ.

### 3.2 Usage fields

Pi usage reports separate fields where the adapter provides them:

- input;
- output;
- cacheRead;
- cacheWrite;
- cost input/output/cacheRead/cacheWrite/total.

A provider may omit or normalize fields differently. Missing data must remain
unknown; it must not be replaced with an invented hit or miss.

OpenPI model-info currently calculates a branch-cumulative trend from:

~~~text
promptTokens = input + cacheRead + cacheWrite
cachePercent = cacheRead / promptTokens
~~~

This is useful for historical efficiency, but it is not a per-turn
invalidation explanation. Issue #188 owns any redesign of how those cumulative
metrics are collected.

Workflow usage exposes input, output, cacheRead, cacheWrite, cost, and turn
totals for a run. The calculation is a run projection, not a provider cache
registry.

### 3.3 Usage scopes

Every report should name its scope:

| Scope | Meaning | Current status |
| --- | --- | --- |
| Latest request | Usage from one provider request | Provider receipt when available |
| Latest turn | Aggregate requests belonging to one turn | Client projection |
| Branch cumulative | Sum over the active Session branch | Current model-info trend |
| Session cumulative | Sum over the durable Session | Depends on selected branch/history |
| Child cumulative | Usage in one child AgentSession | Child-local projection |
| Workflow cumulative | Sum over a Workflow run's agents | Workflow usage projection |
| Provider billing | Provider's billable accounting | Provider contract/receipt only |

Do not add values from different scopes and call the result a provider cache
hit rate. Do not compare providers without recording the accounting basis.

### 3.4 Retention

An option such as PI_CACHE_RETENTION=long requests a provider retention
policy where supported. It does not guarantee:

- that a cache entry is created;
- that later requests reuse it;
- a particular TTL;
- deletion from the provider;
- zero data retention;
- cross-model or cross-tenant reuse.

Long retention is a provider-side data-retention concern and must not be
described as a ZDR guarantee.

Compaction and branch-summary requests use a separate request class. Pi's
current behavior avoids treating those calls as ordinary cache-write
comparisons. The exact provider behavior remains adapter/provider-owned.

## 4. Prefix identity and invalidation

### 4.1 Identity components

A diagnosis should record sanitized fingerprints for the components that may
affect prefix eligibility:

~~~text
provider / account partition when safely representable
model and route
thinking/reasoning request mode
system/developer projection
context source fingerprint
Skill catalog/body fingerprint
active tool name/order/schema fingerprint
transcript or branch boundary
attachment shape
provider options
cache marker/key hash when safe
request class
~~~

The fingerprints identify client-visible shape. They do not disclose or claim
the provider's physical cache key.

### 4.2 Invalidation matrix

| Change | Client observation | Cache conclusion |
| --- | --- | --- |
| First request | No previous warm receipt | No miss diagnosis |
| Model/provider/route change | Model selection event | Likely new client epoch; provider reuse unknown |
| Thinking/reasoning change | Request option change | Possible prefix/options invalidator; inference |
| Active tool added/removed/replaced | Tool surface/schema changed | Possible prefix invalidator; inference |
| Tool order/schema changed | Serialized definitions changed | Possible prefix invalidator; inference |
| Context file changed | Source fingerprint changed | Possible invalidator after reload/use |
| Skill body read/changed | Visible content changed | Possible invalidator after load/use |
| Capability group activated | Active tool surface changed | Correlation only |
| Branch/tree navigation | History/projection changed | New client epoch; provider reuse unknown |
| Compaction | Context rewritten | New request shape; not a cache hit |
| Branch summary | Summary projection requested | Separate request class |
| Child creation | New Session/authority projection | Separate cache principal by default |
| Workflow replay | No new provider request | Replay, not cache |
| Provider TTL/eviction | No client-visible cause | Unknown unless provider reports it |
| Partial cache read | Read tokens plus new input | Provider-reported partial reuse; cause unknown |
| Consecutive cold request | Zero read after zero read | Does not prove a repeated invalidation |

Issue #156 owns per-turn detection and UI. Its detector must distinguish
observation, correlation, and verified provider cause. It must not label every
zero cacheRead as an invalidation.

### 4.3 Cache epochs

Compaction, branch navigation, model change, and child creation may begin a
new client comparison epoch. Resetting a client baseline prevents the UI from
claiming continuity across structurally different requests. It does not delete
or invalidate a provider cache.

An epoch is a diagnostic grouping, not a server cache namespace.

## 5. Lifecycle boundaries

### 5.1 Normal turn

A normal turn may have:

~~~text
construct request
  -> provider reports input/cacheRead/cacheWrite/output
  -> client stores usage
  -> model-info updates its cumulative projection
~~~

The usage receipt is authoritative for the reported fields. It is not
evidence that the provider reused every byte of the client's intended prefix.

### 5.2 Compaction

Compaction changes Session context. After compaction, the next request may
contain a new summary, retained messages, and the current system/tool
projection. That request must be classified separately from the ordinary
turn that preceded it.

A summary request is not a cache hit. A later normal request may have cache
reuse for part of its new prefix, but that must be established from the later
provider receipt.

### 5.3 Branch and tree navigation

Branch navigation changes the selected history. It may change messages,
summaries, tool projections, context files, and provider options. Model-info
must not carry a stale causal label across the branch boundary.

The branch trend may remain useful as historical data, but the first request
after navigation is a new diagnostic comparison point.

### 5.4 Children, forks, and workflows

Children receive fresh Sessions and may have different:

- model/provider;
- thinking level;
- system prompt;
- tool definitions;
- Trust and authority;
- working directory;
- Skill/resource projection;
- request options.

They therefore use separate cache principals by default. Parent/child prefix
coincidence is not a sharing contract.

A narrowly specified auxiliary side-call could share a provider affinity only
if it proves identical model, tools, authority, working directory, schema,
system prefix, and retention rules. No such general OpenPI contract exists.

Workflow replay is persisted-result reuse. It avoids execution; it does not
reuse a provider prompt cache.

## 6. Provider and ecosystem comparison

The following baseline separates source facts from provider contracts. It does
not assert a common cache implementation.

### OpenAI and Codex

OpenAI documents automatic prompt caching and exposes cache usage in request
usage where applicable. Codex client code may carry request identity or cache
affinity inputs. The provider's physical key, partition, eviction, and
encryption remain undisclosed.

Codex conversation state and prompt caching are separate concepts. Reusing a
conversation or response chain does not by itself prove a cache hit.

### Anthropic and Claude Code

Anthropic documents prefix caching and explicit cache-control breakpoints.
Claude Code documentation describes product context and cost surfaces, but its
private request assembler and ordinary child cache sharing are not public
evidence.

A cache breakpoint is a client/provider contract input, not a proof of the
physical cached value or later hit unless usage confirms it.

### Gemini

Gemini documents implicit and explicit caching. An explicit cache resource
has a provider object lifecycle; implicit caching is provider-controlled.
The audited Gemini CLI revision does not make its use of explicit resources a
general OpenPI behavior.

### xAI and Grok Build

xAI exposes prompt/cache contracts and retention options. Grok Build also
demonstrates controlled side calls with distinct context semantics. Neither
proves that arbitrary OpenPI children should share cache identity.

### Hermes

The fixed Hermes source distinguishes prompt caching, cache scope, compaction,
and provider-specific routes. Its richer cache scope and fallback behavior
should not be copied into OpenPI without an ownership and evidence contract.

### OpenCode

The fixed OpenCode source has provider-aware request construction and
compaction/pruning paths. Its client-side options and transformations do not
prove provider cache hits or a universal cache identity.

## 7. Observability contract

### 7.1 Safe operator display

A future diagnostic may display:

- request/turn/branch scope;
- provider-reported input, read, write, and output buckets;
- sanitized model/provider/request-class labels;
- source/tool/schema fingerprints;
- correlation tags such as model-change or tool-change;
- unknown when the provider does not expose enough evidence.

It should preserve the existing cumulative cache trend as a trend indicator.
Per-turn markers must be opt-in and operator-facing; they must not enter model
context or alter execution.

### 7.2 Forbidden claims

Do not display or log:

- raw prompt bodies by default;
- credentials, tenant identifiers, or raw affinity keys;
- raw cache-resource names;
- provider physical key construction;
- hidden KV contents;
- deletion or ZDR guarantees from a retention option;
- model/provider causality from latency;
- user blame from a zero cacheRead observation;
- model attention or semantic benefit from a cache hit.

### 7.3 Receipt shape

A sanitized receipt can contain:

~~~text
revision
session / branch / child identity
request class
provider and model label
input / cacheRead / cacheWrite / output / cost buckets
system/context/tool/attachment fingerprints
cache-key or marker hash when safe
observation timestamp
evidence level
~~~

The receipt should omit raw content and should state whether the values came
from the provider, the client, or an inference.

## 8. Verification matrix

The following matrix is the minimum research/test vocabulary for future
per-turn diagnostics. This issue does not create a second telemetry project.

| Case | Expected observation | Allowed conclusion |
| --- | --- | --- |
| First request | No prior baseline | Unknown, not invalidated |
| Warm then warm | Read tokens reported twice | Provider reported reuse; no causal explanation |
| Warm then cold | Prior read, current zero read | Candidate boundary; inspect request shape |
| Cold then cold | Zero read twice | No invalidation claim |
| Partial hit | Read plus new input/write | Partial provider report only |
| TTL/eviction | Read drops without client change | Provider-side cause unknown |
| Model change | Model fingerprint changes | Correlated new epoch |
| Tool schema change | Tool fingerprint changes | Correlated possible invalidator |
| Capability activation | Active surface changes | Correlation only |
| Compaction | Request class changes | Separate compaction epoch |
| Branch navigation | Branch fingerprint changes | Separate branch epoch |
| Child creation | Child identity/policy changes | Separate principal by default |
| Replay | No provider request | Replay, zero provider call |
| Missing usage | Fields absent | Unknown, not zero-hit proof |
| Implicit-cache provider | No explicit marker | Do not infer misses from zero |
| Provider proxy | Adapter option forwarded | Compatibility unproven without receipt |

A paired trace should record the client request shape and provider usage for
OpenPI, Bare Pi, and OMP where the same case is reproducible. The trace must
separate:

- observation: what the provider/client reported;
- correlation: what changed at the same boundary;
- verified cause: what a public provider contract explicitly establishes.

## 9. Coverage and ownership

This audit covers five source workstreams and seven grouped subjects:

1. OpenPI/Pi request construction and usage;
2. OpenAI Codex and Responses API;
3. Anthropic/Claude Code;
4. Hermes Agent;
5. Grok Build, Gemini CLI, and OpenCode as the remaining grouped client
   comparisons.

The fixed-source claims use the revisions recorded below. Claude Code and
rolling provider documentation are documented-contract evidence, not fixed
implementation evidence. No hidden provider behavior is filled in by
inference.

Issue ownership:

- #156 owns per-turn invalidation detection, boundary reasons, and related UI;
- #188 owns cumulative model-info collection/redesign;
- #154 owns checkpoint/rewind, not cache identity;
- #167 owns durable memory;
- #157 owns recoverable resource references;
- #190 owns compaction/context-pivot comparison;
- #193 owns Session/replay lifecycle;
- #195 owns provider/model routing and invocation evidence.

## 10. Minimal recommendation

1. Keep cache controls and normalized usage in pi-ai/provider adapters.
2. Keep Session, branch, compaction, and replay ownership in Pi.
3. Keep OpenPI cache display as a sanitized projection of authoritative usage.
4. Preserve cumulative cache percentage as a trend, then add per-turn
   diagnostics only after a false-positive benchmark.
5. Classify model/tool/context/compaction/branch events as correlation unless a
   provider contract proves the cause.
6. Keep children and forks separate by default.
7. Record request-shape fingerprints and usage buckets, never raw sensitive
   payloads.
8. Fix missing provider usage fields upstream rather than duplicating provider
   semantics in OpenPI.

## 11. Non-goals

- No OpenPI-owned prompt or KV cache.
- No hidden KV persistence or restoration.
- No provider-neutral explicit-cache lifecycle.
- No cache identity sharing for arbitrary children or forks.
- No replay-as-cache terminology.
- No cache hit inference from latency, ids, markers, or UI labels.
- No promise to delete implicit provider cache entries.
- No timeless provider pricing, TTL, eviction, or ZDR constants.
- No tool or prompt reordering solely for cache optimization.
- No raw prompt, credential, tenant, or cache-key logging by default.
- No per-turn UI or model-context changes in this documentation issue.
- No duplicate implementation of #156 or #188.

## 12. Unknowns

- Exact pi-ai adapter source and provider-specific cache normalization at every
  route.
- Provider physical key construction, partitioning, eviction, encryption, and
  region behavior.
- Whether an OpenAI-compatible proxy honors every forwarded cache option.
- Provider-specific treatment of reasoning, deferred tools, attachments, and
  structured-output options.
- Claude Code private assembler and child cache behavior.
- Gemini implicit-cache lifecycle and revocation.
- xAI retention, isolation, encryption, and ZDR interaction.
- Exact cache-prefix behavior after provider-side request rewriting.
- Cross-model or cross-tenant reuse beyond documented contracts.
- Whether latency changes are caused by caching or unrelated transport state.

## 13. Fixed sources

OpenPI and Pi:

- OpenPI audit revision: 2a69d3f32994da4123f1312b7fa84ef3d6119be1
- Pi tag: https://github.com/earendil-works/pi/tree/v0.84.3
- OpenPI model-info projection: ../../extensions/model-info/index.ts
- OpenPI tool-surface policy: ../../extensions/shared/tool-surface.ts
- OpenPI child-session policy: ../../extensions/shared/child-session.ts
- Workflow usage projection: ../../extensions/workflows/model.ts
- Session/replay contract: SESSION_LIFECYCLE_AND_RECOVERY_CONTRACT.md

OpenAI:

- https://platform.openai.com/docs/guides/prompt-caching
- https://platform.openai.com/docs/guides/conversation-state
- https://platform.openai.com/docs/guides/your-data
- https://github.com/openai/codex/tree/a9e447a69dee4f2789dd8d8c776e314772c1f049

Anthropic and Claude Code:

- https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- https://docs.anthropic.com/en/docs/build-with-claude/context-editing
- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/sub-agents

Hermes:

- https://github.com/NousResearch/hermes-agent/tree/cbd8de8ad64530be01efea23b7764d5c37c634ed

Grok Build and xAI:

- https://github.com/xai-org/grok-build/tree/c2ad97f87aea4303b6000a2c22128bc91ee76c9b
- https://docs.x.ai/docs/guides/prompt-caching
- https://docs.x.ai/developers/advanced-api-usage/prompt-caching/multi-turn

Gemini:

- https://github.com/google-gemini/gemini-cli/tree/812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8
- https://ai.google.dev/gemini-api/docs/caching

OpenCode:

- https://github.com/anomalyco/opencode/tree/8615731d46153dd29b89e205fb55b2cc16205cb0

This document describes ownership and evidence limits. Runtime changes must
update the owning implementation, tests, and contract together.