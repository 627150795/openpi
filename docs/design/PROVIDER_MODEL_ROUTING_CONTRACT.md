# Provider and Model Routing Contract

Status: documentation contract. This document records current ownership and
evidence boundaries for provider/model selection, fallback, reasoning, and
invocation reporting. It does not add a model registry, provider adapter,
fallback engine, reasoning store, cache manager, or endpoint router.

Coverage: planned 5, covered 5, failed [].

## Decision

Pi owns provider/model resolution, credentials, adapters, request
serialization, retries, provider-native reasoning, Session model entries, and
provider-reported usage. OpenPI owns only its package role preferences, child
model/effort inputs, Workflow invocation identity, replay journal, and bounded
operator projections.

These states must remain distinct:

~~~text
configured preference
  != catalog model
  != Session-selected model
  != resolved request model
  != endpoint route
  != transport attempt
  != provider-returned model/response
  != successful invocation
~~~

Likewise:

~~~text
thinking/reasoning level
  != provider effort value
  != reasoning-token usage
  != visible reasoning summary
  != opaque/encrypted reasoning item
  != provider-native continuation state
~~~

## Evidence and runtime provenance

The source audit used these bounded references:

| System | Revision or version | Evidence status |
| --- | --- | --- |
| OpenPI | 2a69d3f32994da4123f1312b7fa84ef3d6119be1 | fixed source audit |
| Pi | @earendil-works/pi-coding-agent@0.84.3 | installed source inspected |
| Codex | a9e447a69dee4f2789dd8d8c776e314772c1f049 | fixed source inspected |
| Hermes | cbd8de8ad64530be01efea23b7764d5c37c634ed | fixed source inspected |
| Grok Build | c2ad97f87aea4303b6000a2c22128bc91ee76c9b | fixed source inspected |
| Gemini CLI | 812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8 | fixed source inspected |
| OpenCode | 8615731d46153dd29b89e205fb55b2cc16205cb0 | fixed source inspected |
| Claude Code | official rolling documentation | implementation is proprietary |

This is a fixed-source architecture audit, not a diagnosis of the currently
loaded runtime. Before reasoning from an installed UI, provider, or package,
prove the checkout revision and the single OpenPI source reported by pi list as
required by the README. The selected source and the loaded source may be
different paths.

Evidence labels are:

- Fixed fact — established by a bounded source revision or installed package.
- Rolling documentation — public documentation that is not a pinned
  implementation guarantee.
- Inference — a conclusion derived from the preceding facts.
- Unknown — not established and therefore not safe to assume.

## Routing taxonomy

| State | Meaning | What it proves |
| --- | --- | --- |
| Configured preference | User, setup, or role-requested provider/model | Intent only |
| Catalog model | Entry in Pi ModelRegistry | Metadata can be resolved |
| Session-selected model | Current provider/model stored by the Session | Session preference |
| Resolved request model | Model object after registry and compatibility resolution | Request inputs selected |
| Endpoint route | Base URL, wire API, proxy/gateway, headers, and auth destination | Intended transport route |
| Transport attempt | One HTTP, SSE, or WebSocket attempt | An attempt occurred |
| Provider-returned model | Model label reported by the response, when present | Provider-reported identity only |
| Response identity | Provider response ID or continuation identity | Provider-native reference |
| Successful invocation | Terminal response accepted by the client | This call reached a successful client outcome |

A catalog match is not authentication, quota, endpoint reachability, or
request-time availability. A selected provider/model label is not always the
actual upstream compute model when a gateway or provider performs routing.

## Failure vocabulary

The word “fallback” is too broad for diagnostics. Use these terms separately:

- transport retry;
- stream retry;
- authentication refresh;
- WebSocket-to-HTTP/SSE transport fallback;
- endpoint or gateway failover;
- same-provider model fallback;
- cross-provider fallback;
- startup or Session-restoration substitution;
- context-overflow compaction and retry;
- capability adaptation or downgrade;
- user/model-explicit model change.

Each mechanism has a different owner, evidence level, and user-facing meaning.
A retry normally keeps the requested model; Session-restoration substitution can
change it before a request; provider or gateway routing may change the
upstream destination without OpenPI selecting it.

## Ownership

### Pi owns

- ModelRuntime and ModelRegistry;
- built-in, custom, remote, and extension-registered model catalogs;
- models.json, provider adapters, request serialization, and wire protocols;
- credentials and OAuth refresh;
- model capability metadata and thinking-level mapping;
- provider/transport retry and Session restoration;
- Session model/thinking entries and provider-message replay;
- provider-native reasoning or continuation items;
- usage and response metadata returned by assistant messages;
- Session identity and any provider cache-affinity inputs.

### OpenPI owns

- package-owned role preferences persisted by /openpi-setup;
- child and Workflow model/effort request fields;
- model-resolution precedence for OpenPI child roles;
- independent child Pi Sessions and their lifecycle;
- Workflow call identity, replay journal, and usage projection;
- bounded model labels and operator-facing UI.

OpenPI child Session IDs and Workflow child reuse can affect Pi/provider cache
affinity as an input. That does not make OpenPI the cache-key owner.

### Providers and gateways own

- actual upstream endpoint routing behind a gateway;
- provider-side fallback and returned model labels;
- response IDs and encrypted/native continuation state;
- authoritative billing and provider-reported usage;
- provider-side retention and server state.

## Pi 0.84.3 behavior

### Initial selection and restoration

The audited Pi resolution order is:

1. CLI provider/model selection;
2. scoped model selection for a non-resumed Session;
3. model restored from the Pi Session;
4. configured settings default;
5. an authenticated available model.

When a persisted Session model cannot be restored, Pi may select another
available/authenticated model and warn. That is Session-start restoration
substitution, not a generic request-failure fallback.

/model appends a model_change Session entry. /thinking appends a
thinking_level_change entry. The effective reasoning level may be clamped or
mapped for the selected model. A model change requires honest re-evaluation of
context window, tools, images, structured output, input modalities, provider
continuation items, and reasoning compatibility.

### Catalog presence versus request success

Pi merges built-in models, custom models, remote catalogs, and extension
registrations. A registry match proves only that metadata resolved. It does not
prove valid credentials, quota, endpoint reachability, or that the provider will
accept the next request.

Model metadata may describe the wire protocol, base URL, authentication,
reasoning support, input modalities, context window, output limit, pricing,
sampling defaults, and compatibility flags. Those descriptions remain inputs
to the adapter; they are not terminal invocation evidence.

### Retry and fallback matrix

| Mechanism | Owner / observed behavior | Route/model change |
| --- | --- | --- |
| Provider transport retry | Pi/provider adapter retries transient network, 408, 409, 429, or 5xx responses with bounded policy | Normally no |
| Agent auto-retry | Pi may retry a retryable overload, rate-limit, or server failure while preserving Session audit | No generic model change |
| Overflow recovery | Pi compacts and retries once | No automatic model change |
| OAuth refresh | Provider credential refresh | No intended route/model change |
| Session restoration substitution | Missing/unusable persisted model selects another available model | Yes, before normal request |
| OpenRouter routing | Provider-native order, only, allow_fallbacks, and related policy | Gateway may change upstream |
| Anthropic returned-model fallback | Provider may report another actual model | Provider-side change |
| Generic endpoint failover | Adapter-specific unless explicitly documented | Unknown |
| Generic cross-provider runtime fallback | No universal Pi contract established | Unknown |

OpenRouter and provider-side returned-model behavior must not be attributed to
OpenPI. Generic cross-provider fallback is not an OpenPI feature.

### Reasoning and usage

Pi's canonical thinking levels are:

~~~text
off | minimal | low | medium | high | xhigh | max
~~~

Adapters map these levels to provider-native effort, budget, or adaptive
settings. Provider usage may expose a reasoning subset, but it is
provider-dependent and included in returned usage rather than a universal extra
total. Missing reasoning usage means unknown, not zero.

OpenAI Responses and other adapters may preserve opaque signatures, encrypted
content, response IDs, or continuation items. These are not readable chain of
thought. They may be transformed or dropped when the model/provider changes.

Usage, context occupancy, cost, cache reads/writes, and billing are different
measurements. A cumulative Session total includes historical messages even
after compaction; current context occupancy can decrease. Neither is direct
billing proof without provider reconciliation.

## OpenPI child and Workflow routing

### Child model precedence

At the audited OpenPI revision, the precedence is:

1. explicit model on the spawn or Workflow invocation;
2. model in the selected Agent Type;
3. role assignment persisted by /openpi-setup;
4. parent Session's current model.

For a bare model ID, resolution prefers the parent provider and then requires
global uniqueness. A registry match is not an auth preflight; child creation
may succeed while the later provider request fails.

Explicit provider/model fields are model-authored tool arguments and can select
any matching registry entry. There is no separate OpenPI cost/provider
confirmation gate. Do not invent one without a concrete authority requirement;
document the selected child model and the actual failure honestly.

### Reasoning precedence and child identity

Reasoning precedence is:

1. explicit reasoning_effort;
2. Agent Type default;
3. parent Session thinking level.

OpenPI passes the resolved Pi model and canonical thinking level into a fresh Pi
child Session. Children have fresh Session IDs, resources, and extension
runtimes. They do not inherit the parent response ID, provider-private
continuation items, live connection, or native cache identity.

### Workflow Replay

Pi owns JSONL Session history and provider-message replay. OpenPI separately
owns Workflow journals, call-key replay, result artifacts, and replay
accounting. A verified Workflow Replay hit reuses a persisted child result
without a provider call, so it has no new actual route, response ID, or provider
usage.

The replay receipt must identify the original invocation and explicitly say that
no new model execution occurred. Workflow fingerprints may include selected
provider/model/effort, but Replay is not provider cache reuse or native
continuation restoration.

## Invocation evidence and safe reporting

The minimum useful invocation vocabulary is:

~~~text
requestedProviderModel
sessionSelectedProviderModel
resolvedRequestModel
responseProviderModel?   // provider-reported, optional
responseId?              // provider-specific, optional
thinkingLevel
reasoningUsage?          // unknown when absent
attemptKind?             // only when observed
replayed                 // true means no new provider call
usage?                   // provider-reported, not billing proof
terminalStatus
~~~

The exact fields above are a documentation vocabulary, not a requirement to
make OpenPI collect data Pi does not expose. The footer and model-info
projection can show the current Session-selected provider/model and thinking
level, but they do not prove endpoint URL, gateway upstream, retries, OAuth
refresh, provider fallback, response identity, cache key, or reasoning tokens.

When a provider reports responseModel or responseId, it is useful invocation
evidence but not universal truth about the ultimate route. UI labels must not
synthesize stronger evidence than the provider response or persisted invocation
record supports.

Never copy bearer headers, endpoint credentials, auth-source values, cache keys,
opaque reasoning payloads, or provider-private continuation state into setup
config, child prompts, Workflow artifacts, or default UI.

## /openpi-setup boundary

/openpi-setup is the sole package-owned configuration entry point. A future
package-owned role-model choice must continue to update:

- extensions/setup/;
- extensions/shared/setup-config.ts;
- no-argument /openpi-setup status;
- SETUP.md;
- canonical defaults and prose in README.md.

The following remain mandatory:

- no provider/model hardcoded as a package default;
- role models inherit the parent unless explicitly configured;
- no model call during installation or before explicit configuration;
- only provider/model references are stored, never credentials;
- Pi's registry validates references at write time, while authentication and
  availability remain request-time facts;
- existing Pi preference files are not silently rewritten;
- the running Session is not automatically reloaded after persistence.

## Cross-system comparison

Other systems demonstrate different product choices, not behavior that OpenPI may
infer for Pi:

- Codex layers configuration, provider definitions, custom endpoints,
  transport retries, and limited fallback policy. WebSocket-to-HTTPS fallback
  is transport fallback; it is not a model fallback.
- Claude Code documents model aliases, pins, deployment paths, fallback models,
  and effort/adaptive-thinking options, but its private routing and
  continuation implementation remain unknown.
- Hermes has an explicit provider/fallback chain and route-aware reasoning
  handling. That complexity belongs to Hermes' provider owner and must not be
  copied into OpenPI.
- Grok Build is primarily a single product stack; its routing and retry
  behavior do not establish a generic OpenPI cross-provider contract.
- Gemini CLI has its own model router and availability service; its sticky
  route and fallback behavior are not Pi behavior.
- OpenCode has a provider catalog and bounded retry, but no universal
  cross-provider fallback contract was established.

## Related Issues and boundaries

- [#169](https://github.com/tt-a1i/openpi/issues/169) owns external capability
  providers such as Browser, Web, GitHub, Computer, and Security; it does not
  own LLM provider routing.
- [#188](https://github.com/tt-a1i/openpi/issues/188) owns repeated branch
  scanning in model-info.
- [#156](https://github.com/tt-a1i/openpi/issues/156) owns per-turn cache
  invalidation diagnostics.
- [#191](https://github.com/tt-a1i/openpi/issues/191) owns prompt-cache
  identity, accounting, and lifecycle architecture.
- [#193](https://github.com/tt-a1i/openpi/issues/193) owns Session and Workflow
  replay lifecycle.

This Issue documents selection, routing, fallback taxonomy, reasoning-state
ownership, and invocation evidence. It does not reopen those narrower scopes.

## Unknowns

The following remain unknown unless a later bounded source or runtime receipt
proves them:

- actual endpoint, auth source, retries, and server-side fallback in a loaded
  runtime;
- whether a gateway's returned model identifies ultimate compute in every case;
- provider-internal routing hidden behind one model ID;
- complete retry/fallback behavior for every Pi adapter;
- provider persistence and replay guarantees for opaque reasoning items;
- authoritative reasoning-token accounting when a provider omits it;
- context, tool, modality, structured-output, or attachment compatibility after
  arbitrary model changes;
- exact cost and cache effects of child Session identity;
- Claude Code private routing and continuation internals;
- generic cross-provider fallback in Grok or OpenCode.

## Non-goals

- No OpenPI model registry or provider adapter stack.
- No routing precedence parallel to Pi.
- No automatic cross-provider fallback.
- No fallback state machine.
- No endpoint or auth configuration outside Pi.
- No reasoning or chain-of-thought store.
- No response/native-continuation replay owned by OpenPI.
- No cache-key inference or provider cache registry.
- No installation-time model calls or hardcoded provider defaults.
- No sensitive auth, endpoint, cache, or opaque reasoning data in UI/artifacts.
- No UI claim about actual routing without provider response evidence.
