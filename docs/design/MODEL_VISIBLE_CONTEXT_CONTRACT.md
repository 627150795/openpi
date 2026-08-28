# Model-Visible Context Contract

Status: documentation contract. This document records what may enter model
context in OpenPI and Pi, when it enters, who owns its authority, how lifecycle
events change it, and what evidence can prove the provider-bound payload.

It does not add a second prompt assembler, MCP runtime, resource router, memory
store, keyword-based context router, provider adapter, or UI-to-model channel.

## Decision

Pi remains the owner of:

- system prompt construction;
- Session context and message history;
- repository/resource loading;
- Skill discovery and loading;
- tool registration and provider tool serialization;
- extension lifecycle hooks;
- compaction, branch projection, and provider request construction.

OpenPI owns only its capability handlers, active-tool filtering, child policy,
package-specific projections, and UI. A capability decision is not a second
prompt assembler.

The following must remain distinct:

~~~text
model-visible placement
  != content provenance
  != runtime authority
  != provider-bound request bytes
  != model attention or compliance
~~~

A repository file can appear in a high-priority prompt position while remaining
untrusted content. A tool schema can describe an operation but cannot grant
permission to execute it. A UI footer can report a counter but does not become
model context unless an explicit serialization path adds it.

## 1. Context source inventory

The 18 source classes below are a vocabulary, not a claim that every source is
present in every Session.

| # | Source class | Primary owner | Typical timing |
| --- | --- | --- | --- |
| 1 | Base system/developer instructions | Pi/host/provider | Every provider request |
| 2 | Appended system instructions | Pi host/extensions | Session or turn lifecycle |
| 3 | Repository context files | Pi resource loader | Session/context refresh |
| 4 | Skill catalog metadata | Pi Skill loader | When Skill discovery is active |
| 5 | Skill body and resources | Pi Skill/read path | Explicit selection or read |
| 6 | Tool prompt snippets and guidelines | Pi tool registration | Active tool surface |
| 7 | Provider tool definitions | Pi provider adapter | Provider request serialization |
| 8 | Deferred tool discovery | Pi/OpenPI extension seam | Capability activation |
| 9 | MCP server instructions | MCP integration extension | MCP connection/catalog |
| 10 | MCP tool definitions/results | MCP integration and Pi | Registration or tool call |
| 11 | MCP resources | MCP integration extension | Explicit URI/resource read |
| 12 | MCP prompts | MCP integration extension | Explicit prompt expansion |
| 13 | Files and attachments | Pi message/tool/provider path | User input or tool result |
| 14 | Hook and extension contributions | Pi extension lifecycle | Hook-specific request stage |
| 15 | Memory and retrieval | Memory owner, currently related #167 | Query or lifecycle trigger |
| 16 | Compaction summary and retained tail | Pi compaction, related #190 | Compaction or retry |
| 17 | Child-specific prompt and resources | Child-session owner and Pi | Child creation |
| 18 | UI-only state | UI owner | Render only unless serialized |

### 1.1 Source, placement, and authority

Every context projection should be described with at least:

~~~text
source identity
content class
model-visible placement
load trigger
refresh rule
runtime authority
evidence level
~~~

The position of text in a system or developer section is not a provenance
upgrade. The position of a tool definition is not an approval grant. The
authority boundary remains the runtime's tool allowlist, Trust decision,
approval policy, sandbox/filesystem policy, child intersection, credentials,
and network policy.

### 1.2 UI is not context

Footer text, dashboard counters, spinners, suggestion rows, transcript
summaries, and status cards are operator projections. They are not part of the
model-visible request unless a host or extension explicitly serializes them as
a message or system contribution. This contract does not add such a channel.

## 2. Pi request pipeline

For Pi 0.84.3, the relevant model-visible system construction is:

~~~text
base system prompt
  + active-tool prompt snippets and guidelines
  + appended system text
  + context files
  + visible Skill catalog, only when read is active
  + current working directory
~~~

Provider tool definitions are a separate request field. They must not be
described as ordinary text inside the system string.

The current request then passes through lifecycle seams that can change what is
sent:

1. before_agent_start may append a custom message or replace the system
   prompt;
2. template, Skill expansion, and user input construct the current turn;
3. context may rewrite the message array before a model call;
4. tool execution results may be transformed before later context use;
5. before_provider_request may rewrite the provider-specific serialized
   payload;
6. provider adapters serialize system/developer messages, tools, attachments,
   and provider options.

Therefore an intermediate system prompt is not the final provider payload.

### 2.1 Intermediate versus final evidence

The following evidence is useful but incomplete by itself:

| Observation | Proves | Does not prove |
| --- | --- | --- |
| getSystemPrompt result | One intermediate system projection | Later context/provider rewrites |
| Startup resource list | Discovered/loaded resource metadata | Full body bytes or provider inclusion |
| Active tool roster | Client-side active definitions | Provider serialization or execution |
| Skill catalog | Visible discovery metadata | Full Skill body or use |
| Context counters | Local size estimate or usage | Exact provider tokenization |
| Cache/usage totals | Provider-reported counters | Causal effect or model attention |
| UI footer/dashboard | Operator-facing projection | Model-visible context |
| Provider-boundary capture | Bytes/options submitted by client | Provider acceptance or model attention |
| Provider response | Response and reported usage | Hidden server routing or causal use |

A client-side capture at the provider boundary can establish request bytes,
metadata, tool definitions, attachments, and selected provider options. It
cannot establish that the provider accepted every semantic instruction, that
the model attended to a source, or that the model complied with it.

Sensitive captures should record hashes, shapes, source ids, and bounded
metadata by default. Do not store raw credentials, private prompts,
attachments, memory text, or MCP payloads merely to produce diagnostics.

## 3. Repository context and Trust

Pi Project Trust gates project settings, .pi resources, packages, and
extensions. It is not a sandbox and does not constrain what already-enabled
writable tools may do.

Context files such as AGENTS.override.md, AGENTS.md, and CLAUDE.md are loaded
regardless of Project Trust unless context loading is disabled. Consequently:

- repository context can persuade the model to invoke tools with the Pi
  process's authority;
- repository context cannot grant Project Trust;
- repository context cannot widen a tool allowlist or approval policy;
- Trust must not be presented as protection from repository prompt injection;
- context provenance remains important even when its text is high priority.

The security contract is therefore:

~~~text
untrusted text
  -> may influence model behavior
  -> cannot widen runtime authority
~~~

A context loader should retain source path, import relationship, truncation
state, and load timing where the host makes those facts available.

## 4. Skills

Skill discovery and Skill execution are separate surfaces.

### 4.1 Catalog

When the read tool is active, Pi may expose a bounded catalog containing Skill
name, description, and location. The catalog is discovery metadata. It is not
the full Skill body and should not be represented as if every Skill has already
been loaded.

OpenPI's explicit capability mode keeps ordinary Sessions free of a general
loading gateway. Adaptive mode keeps only the small OpenPI loading gateway
resident and lets the model request a capability group when the task benefits
from it. This is tool-surface policy, not a second prompt assembler.

### 4.2 Body and resources

Full Skill instructions, references, scripts, and assets enter context only
after explicit Skill selection or a read operation. They are source content
with their own provenance and may contain instructions that are not higher
priority than the host's runtime policy.

A Skill body being loaded proves only that its content was made available to
the Session. It does not prove that the provider saw the exact bytes after
later hooks or that the model followed it.

### 4.3 Refresh

A changed Skill file does not universally change the current model projection.
The correct refresh action depends on the host:

- explicit re-read;
- resource reload;
- new Session;
- child creation;
- next provider request;
- or no change until a lifecycle hook runs.

Documentation must name the refresh trigger instead of saying that a disk
change is automatically visible.

## 5. Tool metadata and definitions

Pi tool visibility has two projections:

1. prompt snippets/guidelines that explain active tools in system context;
2. provider tool definitions containing executable schemas and metadata.

They are related but not identical. Provider tool definitions are serialized
separately from ordinary system text.

The observed registration precedence is:

~~~text
Pi built-ins
  -> extension tools replace equal names in extension load order
  -> SDK custom tools replace extension or built-in definitions
~~~

A replacement owns its complete schema and prompt metadata. It does not inherit
the replaced tool's guidelines by implication.

OpenPI capability groups mutate the active tool surface through Pi's
registration seam. Explicit mode begins with the ordinary Pi-native tool set.
Adaptive mode keeps the small loading gateway resident. Activation and
replacement are runtime events; they are not evidence that the provider
accepted a particular schema until the provider-bound request is observed.

A tool schema or prompt instruction can steer a model. It cannot by itself
grant filesystem access, network access, credentials, Trust, approval, or the
ability to bypass a child policy.

## 6. Deferred discovery and MCP boundaries

Pi 0.84.3 has no built-in MCP client. Any MCP behavior must therefore belong to
an extension or provider integration and must document its own source and
authority.

These four MCP classes must not be collapsed:

| MCP class | Meaning |
| --- | --- |
| Server instructions | Text supplied by a server/integration |
| Tools | Executable schemas and tool results |
| Resources | URI-addressed data read through an explicit client path |
| Prompts | Templates expanded into messages |

An MCP resource is not a tool schema. An MCP prompt is not automatically a
system instruction. Server instructions are not trusted merely because they
are inserted into a system section.

If a future integration exposes deferred MCP discovery, document:

- which catalog is visible before activation;
- whether schemas are loaded by a tool or a lifecycle event;
- approval and permission checks;
- source and server identity;
- output bounds and spill/artifact behavior;
- reconnect and refresh rules;
- what is proven by a provider-boundary capture.

OpenPI does not add a generic MCP runtime or provider-neutral Tool Search
abstraction in this issue.

## 7. Hooks and mutation order

Extensions may contribute at different stages:

| Stage | Possible contribution | Evidence limit |
| --- | --- | --- |
| before_agent_start | System prompt or custom message | Later hooks can still change it |
| context | Message-array projection | Provider adapter may rewrite it |
| tool_result | Bounded/rewritten future context | Does not prove original output was sent |
| session compact/tree | Summary, retained tail, branch projection | Does not prove future request bytes |
| before_provider_request | Final provider-specific request rewrite | Strong client-side payload evidence |
| Provider adapter | Serialization and provider options | Server-side routing remains unknown |

When multiple extensions mutate one stage, load order and the final runner
contract are authoritative. A documentation claim should identify whether it
describes a pre-hook projection, post-hook projection, or serialized request.

The system prompt returned by a helper such as getSystemPrompt is therefore
not a universal audit receipt.

## 8. Compaction, branch, and child lifecycle

### 8.1 Compaction

After compaction, the next request receives the current system prompt again,
including current context files and any visible Skill catalog, together with
the compaction summary and retained messages.

Previously read Skill bodies, files, and tool results are not independently
reloaded merely because compaction occurred. They remain available only if
retained in recent messages, represented in the summary, or explicitly read
again.

Compaction is a context projection, not a cache hit, memory write, or replay.
The compaction summary may be model-authored and must retain its own
provenance and evidence limits.

### 8.2 Branch and tree navigation

A branch or tree change selects a different Session projection. It may change:

- message history;
- retained summary and tail;
- loaded context files;
- active tools;
- current working directory;
- child/workflow references;
- provider cache compatibility.

A branch-local UI state must not be presented as proof that the provider
received the same context as another branch.

### 8.3 Child Sessions

OpenPI children create fresh SettingsManager, resource loader, extension
registry, system prompt, and Pi AgentSession. They do not copy the parent's
transcript or intermediate system projection.

Children may inherit model and thinking defaults. Same-cwd Trust may reuse the
parent's resolved decision; alternate-cwd Trust is resolved separately and
fails closed when unavailable. Child tools are the fail-closed intersection of
parent authority, child-safe package classification, role narrowing, and
post-start preflight.

A child-specific prompt is a new source class. A child result or artifact path
is not automatically injected into the parent model context; its owner must
explicitly project or deliver it within bounds.

## 9. Timing, refresh, and cost classes

Every source should be classified with the following minimum fields:

| Field | Question |
| --- | --- |
| Discovery | How is the source found? |
| Load timing | When does content enter the client projection? |
| Refresh | What event makes a changed source visible? |
| Provenance | Can the source identity/path/version be named? |
| Cost | Which bytes/tokens or provider usage can be measured? |
| Authority | Which runtime policy governs actions caused by it? |
| Evidence | What observation can prove inclusion? |

Recommended timing categories:

- conditionally always present: base/append system, loaded context files,
  visible Skill catalog, active tool metadata;
- turn-triggered: user input, attachments, before_agent_start, contextual
  rules;
- request-triggered: context rewrite, memory/retrieval, provider rewrite;
- tool-triggered: file/resource reads and tool results;
- lifecycle-triggered: reload, Trust resolution, capability activation, MCP
  reconnect, compaction, fork, tree change, and child creation.

No static token table is portable across providers. Prefer reporting:

- characters or bytes before serialization;
- active tool count and schema fingerprint;
- context-file and Skill source identities;
- loaded Skill/resource identifiers;
- message and result truncation;
- provider-reported input, cache, and output usage after the request.

A source change may invalidate a provider prefix, but client observation of a
change is correlation unless the provider exposes a causal cache contract.

## 10. Cross-system comparison

The following comparison is limited to fixed source revisions or official
documentation. It is context for boundaries, not a request to copy another
runtime.

### Codex

The fixed Codex source separates base instructions, contextual developer
fragments, world-state sections, history/current input, and model-visible tool
definitions. Its ToolRouter binds per-step environment, permissions, MCP
projection, and tool specifications. AGENTS.md collection and Skill snapshots
retain source metadata and bounded loading.

The source proves that MCP tools can enter the tool router. It does not justify
claiming that every MCP resource, prompt, or server instruction is
automatically injected.

### Hermes

The fixed Hermes implementation separates stable, contextual, and volatile
prompt tiers. It uses bounded project context and Skill catalog metadata,
loads full Skill content progressively, and may mark content for reload after
compaction. Its MCP transport does not establish generic automatic injection
of all resources and prompts.

### Grok Build

The fixed Grok Build source demonstrates deferred MCP tool discovery through
stable search/invocation tools and bounded tool output. It also separates
project instructions, Skill metadata/body, memory, compaction items, and
child-specific context. This proves a tool-search mechanism, not a universal
provider-side context rule.

### Gemini CLI

The fixed Gemini CLI source separates trusted-root memory, imported context,
Skill activation, MCP instructions/tools/resources/prompts, attachments,
subagents, compaction, and auto memory. It uses product-specific trust rules;
those rules must not be generalized to Pi.

### OpenCode

The fixed OpenCode source composes a dynamic per-turn system array from
project instructions, configured local/remote rules, Skills, permission-
filtered MCP instructions/tools, plugin transforms, attachments, and
compaction. Remote instruction placement does not make its source trusted.

### Claude Code

Official rolling documentation establishes persistent context files, Skills,
MCP operations, hooks, subagents, memory, and compaction as separate product
surfaces. Its private prompt assembler, exact ordering, budgets, and internal
Tool Search behavior are not public evidence here.

## 11. Evidence contract

Use the following evidence levels:

- source fact: visible in a fixed client revision;
- documented contract: stated by the product/provider;
- client observation: captured in the running client;
- correlation: two client events changed together;
- inference: expected consequence of a documented prefix or lifecycle rule;
- unknown: not established by available source or capture.

Examples:

~~~text
resource discovered
  != resource body loaded
  != resource included in a model request
  != provider accepted it
  != model attended to it
  != model complied with it
~~~

A valid provider-boundary receipt should identify the request/session
generation, provider/model route, source fingerprints, tool schema fingerprint,
attachment shapes, and redaction policy. It should not claim server-side
routing, hidden system instructions, model attention, or causal success.

## 12. Relationship to other Issues

This issue owns the context taxonomy and evidence boundary only:

- #169 owns external Browser/Web/GitHub/Computer/Security provider seams and
  future provider inventory;
- #157 owns recoverable, source-labelled resource references;
- #167 owns durable memory/retrieval;
- #190 owns cross-system compaction and context-pivot comparison;
- #191 owns prompt-cache identity, accounting, and lifecycle;
- #193 owns Session/replay lifecycle and side-effect boundaries;
- #195 owns provider/model selection and invocation evidence;
- #196 owns background execution, artifact, cleanup, and delivery lifecycle.

The related issues should not be merged into one second prompt or context
runtime.

## 13. Minimal Pi-native recommendation

1. Keep Pi as the owner of prompt assembly, Sessions, Skills, tools, Trust,
   hooks, compaction, and provider serialization.
2. Keep OpenPI capability decisions and child projections at their current
   extension seams.
3. Document source provenance and refresh timing without promising universal
   token or provider semantics.
4. Keep MCP integration extension-owned and separate instructions, tools,
   resources, and prompts.
5. Use sanitized fingerprints and provider-boundary captures for diagnostics,
   not raw prompt logging.
6. Treat UI, resource catalogs, and intermediate helpers as projections unless
   the final request path is captured.
7. Add runtime code only when a concrete contradiction or measured evidence
   requires it.

## 14. Non-goals and unknowns

Non-goals:

- No second prompt assembler or instruction precedence engine.
- No OpenPI-owned MCP client, server catalog, or generic resource router.
- No provider-neutral Tool Search abstraction.
- No automatic loading of every Skill body or MCP resource.
- No change to Pi Project Trust semantics.
- No promotion of prompt placement into runtime authority.
- No durable-memory, compaction, cache-diagnostic, or replay implementation.
- No raw provider-payload logging by default.
- No inference of model attention or compliance from telemetry.
- No UI state promoted into model context without an explicit future contract.

Unknowns:

- Exact provider-specific serialization after all Pi adapters and hooks.
- Final order when multiple extensions mutate the same request stage.
- Provider support and billing for deferred tools, cache controls, and opaque
  reasoning items.
- Generic MCP resources/prompts/server-instruction behavior in extensions not
  audited here.
- Claude Code's private prompt assembly and Tool Search internals.
- Exact hot-reload behavior for every live Skill/context source.
- Provider-internal rewriting and the causal effect of any injected source.

## 15. Source map

OpenPI/Pi:

- [OpenPI tool surface](../../extensions/shared/tool-surface.ts)
- [OpenPI capability activation](../../extensions/capabilities/index.ts)
- [OpenPI child-session construction](../../extensions/shared/child-session.ts)
- [Subagent Pi backend](../../extensions/subagents/src/backends/pi.ts)
- [Context pivot](../../extensions/context-pivot/index.ts)
- [Pi package and source declarations](../../package.json)
- [Design documentation index](README.md)

Pi 0.84.3:

- [Skills documentation](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/docs/skills.md)
- [Security and Project Trust](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/docs/security.md#project-trust)
- [Extensions](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/docs/extensions.md)
- [Compaction](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/docs/compaction.md)
- [Usage](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/docs/usage.md)

Fixed comparison baselines:

- [Codex](https://github.com/openai/codex/tree/a9e447a69dee4f2789dd8d8c776e314772c1f049)
- [Hermes](https://github.com/NousResearch/hermes-agent/tree/cbd8de8ad64530be01efea23b7764d5c37c634ed)
- [Grok Build](https://github.com/xai-org/grok-build/tree/c2ad97f87aea4303b6000a2c22128bc91ee76c9b)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli/tree/812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8)
- [OpenCode](https://github.com/anomalyco/opencode/tree/8615731d46153dd29b89e205fb55b2cc16205cb0)

This document is an evidence map, not a new execution layer. Runtime changes
must update the relevant source contract and targeted tests together.
