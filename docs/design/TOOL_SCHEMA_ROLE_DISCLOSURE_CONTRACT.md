# Tool Schema Role Disclosure, Caching, and Boundedness

Status: research contract. This document records how OpenPI should separate
capability loading, role selection, child execution, and result feedback. It
also records the prompt-prefix and cache-stability consequences of changing a
tool schema.

This document does not change the `subagent_spawn` runtime surface. Runtime
follow-up work remains tracked by the implementation issue referenced from
Issue #84.

## Decision

OpenPI should expose four different contracts instead of putting every detail
into one model-facing tool description:

1. **Capability contract:** which OpenPI tool family is available in the
   parent Session.
2. **Selection contract:** the small amount of role information needed to
   choose a child configuration.
3. **Execution contract:** the child's system instructions, model, effort,
   tools, trust, working directory, and lifecycle rules.
4. **Result contract:** the bounded, observable facts returned to the parent
   after launch or settlement.

The parent needs a bounded role-selection index. The child needs the complete
execution contract. A child starting, settling, or being cancelled must not
change the parent's tool schema. A capability, trust, working-directory, or
reload boundary may legitimately rebuild the schema because those events can
change what is authorized.

Stable schemas reduce needless prompt-prefix invalidation, but they do not
prove a provider cache hit. Cache behavior remains provider-specific and must
be reported only when an authoritative usage or request receipt exists.

## 1. Four disclosure boundaries

| Layer | Model-visible question | Contents | Must not claim |
| --- | --- | --- | --- |
| Capability | “What kind of work can I request?” | `subagent_spawn` and its stable companion tools | That a child already exists or that resources are ready |
| Selection | “Which role should I choose?” | Exact role name, bounded purpose, capability class, default effort | That a short description is the child's full prompt or policy |
| Execution | “What will this child actually receive?” | Effective tools, prompt, model, effort, trust, cwd, isolation, lifecycle | That parent prose can grant a denied tool |
| Result | “What happened and what can I do next?” | ID, status, effective surface, bounded receipt, artifact/worktree reference | That a result text is an exact durable transcript or proof of success |

This separation answers the core design question:

> Capability boundaries may change the available tool family; transient
> resource instances should not change the tool schema.

## 2. Current OpenPI facts

The current implementation already establishes several useful boundaries.

### 2.1 Capability loading

OpenPI's default capability discovery is explicit. The parent starts with the
Pi-native surface and loads the Subagent capability when the user or the
configured discovery mode authorizes it. Once loaded, the Subagent tool family
is available as a stable group; the number of running or settled children is
not a reason to add or remove tools.

This keeps “no child yet” and “several children exist” as runtime states
represented by tool arguments, listings, results, or errors rather than by
different model interfaces.

### 2.2 The selection schema

`subagent_spawn` accepts an optional `agent_type` selected from a dynamic,
strict string enum. The generated description is a bounded directory rather
than the complete role file. Each included entry reports:

- the exact role name;
- a whitespace-normalized, UTF-8-bounded purpose;
- a coarse capability class;
- an optional default reasoning effort.

When the directory is larger than its budget, the summary may omit entries,
but omitted exact enum names remain valid. This avoids turning a description
budget into an authorization limit.

The current budgets are explicit implementation facts:

| Surface | Current bound |
| --- | ---: |
| One role purpose | 240 UTF-8 bytes |
| Role directory summary | 4 KiB |
| Default spawn surface | 2.5 KiB |
| Maximum spawn surface | 16 KiB |

The numbers are guardrails, not product promises. If they change, the change
should be measured against request size and calling accuracy rather than
treated as a universal token limit.

### 2.3 The execution boundary

An Agent Type may provide a prompt, model, reasoning effort, and child-tool
allowlist. The effective child surface is the intersection of that allowlist
with the package's child denylist and the tools actually registered in the
child Session.

The important properties are:

- an allowlist can narrow a child, but cannot grant a denied parent-only tool;
- read-only roles have no `write`, `edit`, or `bash` tool to call when their
  effective allowlist excludes them;
- plan mode can narrow a general child and rejects a contradictory worktree or
  implementation request before it changes Git state;
- a typo or unavailable explicitly requested child-safe tool fails before the
  first child model request;
- untrusted project role files do not become child system instructions before
  project trust is known.

The role summary must never be treated as the enforcement mechanism. The
child-session boundary and the final active tool registry are authoritative.

### 2.4 Model and effort precedence

Selection information must not hide precedence. For a direct child, the
effective model is selected in this order:

```text
explicit call -> selected Agent Type -> setup assignment -> parent model
```

Reasoning effort follows the analogous order:

```text
explicit call -> selected Agent Type -> parent effort
```

The parent-facing role directory should show a role default when one exists,
but it should not claim that the default overrides an explicit call.

## 3. Bounded role disclosure

The selection directory is useful only if it stays decision-oriented.

### 3.1 Include

- exact machine-readable role name;
- one short purpose statement;
- an enforceable coarse class such as `read-only`, `workspace-write`,
  `no-tools`, `restricted`, or `inherited-tools`;
- default effort only when it is actually configured;
- a pointer to the role file or Skill for full execution details when the
  calling surface supports one.

### 3.2 Exclude from the parent directory

- the complete child system prompt;
- every tool description for every role;
- per-instance child IDs, timestamps, or live status;
- provider cache keys, prompt contents, or hidden reasoning state;
- unbounded worktree or artifact inventories;
- claims such as “safe”, “read-only”, or “no side effects” when the effective
  tool policy cannot enforce that claim.

“Read-only” is a useful class only when it means the child cannot call the
write-capable tools. It does not mean that reading a secret, starting a
provider request, or observing an external system has no side effect.

### 3.3 Result disclosure

After spawn, the parent may need more precise facts than the selection index
provided. A bounded result can state:

```text
child_id
title
harness
resolved_model
resolved_effort (when known)
working_directory
agent_type (when selected)
effective_child_tools (when known)
isolation_branch (when created)
initial_status
```

The result should explain what the child can do and how to inspect it. It
should not repeat the entire role prompt or transcript. Final child output is
delivery data; it is not automatically a verified artifact, test receipt, or
durable replay record.

## 4. Schema stability and cache impact

### 4.1 What should remain stable

Within one authorized capability lifetime, the following should not change the
parent schema:

- creating the first child;
- creating additional children;
- a child becoming running, settled, failed, or cancelled;
- listing or waiting for existing child IDs;
- a child worktree becoming available or being reclaimed;
- a child result being delivered.

Those facts belong in arguments, result messages, or runtime status.

### 4.2 What may rebuild the schema

These are authorization or configuration boundaries and may legitimately
refresh the generated surface:

- loading or unloading the Subagent capability;
- a new Session or `/reload`;
- a changed trusted working directory;
- a session-only project trust decision;
- a changed Agent Type roster or role override;
- a package version that intentionally changes the contract.

Such a refresh should be observable in diagnostics and should not silently
fall back to a broader lower-precedence role when the higher-precedence source
is malformed or unreadable.

### 4.3 Determinism requirements

For equivalent authorization and role inputs, generated schema text should be
deterministic:

- built-in roles use a fixed order;
- custom roles use a stable name order;
- whitespace is normalized before byte budgeting;
- descriptions do not contain timestamps, random IDs, or live child counts;
- omitted directory entries are reported by count, while exact enum names stay
  machine-valid;
- limits are measured in UTF-8 bytes rather than JavaScript code units.

Determinism makes request-shape comparisons meaningful and prevents an
irrelevant status change from invalidating a provider's reusable prefix.

### 4.4 Cache claims

A prompt cache can depend on the provider, model, system instructions, tool
schema, user content, cache-control policy, and other request fields. A stable
OpenPI schema is therefore a cache-friendly input, not a cache guarantee.

Changing a role description, enum, tool definition, system prompt, model, or
provider may invalidate the prefix from the changed component onward. The
following claims are safe:

- identical request inputs may be eligible for reuse when the provider says so;
- schema changes can reduce reuse and should be measured;
- child count alone should not change the parent schema;
- a cache-read counter is evidence about a provider usage receipt, not proof
  that every visible text prefix was reused.

The system should not add a cache registry merely to make this contract true.

## 5. Invalidation matrix

| Event | Parent schema | Likely request-prefix effect | Required evidence |
| --- | --- | --- | --- |
| First child starts | Unchanged | No child-count invalidation | Runtime status only |
| Child settles or fails | Unchanged | No schema invalidation | Result/status receipt |
| More children are created | Unchanged | No schema invalidation | Resource listing |
| Subagent capability loads | Changes once | Prefix may change at load point | Capability/load event |
| Project trust is resolved | May change | Prefix may change at authorized boundary | Trust decision and source |
| Role file changes on reload | May change | Prefix may change at reload | Roster diagnostics |
| Explicit per-call model changes | Usually unchanged | Child request prefix changes | Resolved model receipt |
| Explicit per-call effort changes | Usually unchanged | Child request prefix changes | Resolved effort receipt |
| Child allowlist changes | Child surface changes | Child prefix changes; parent may only show class | Effective allowlist |
| Provider changes | Parent schema may be unchanged | Provider cache namespace/request rules change | Provider/model identity |
| Context pivot or compaction | Usually unchanged | Conversation prefix changes | Pi compaction receipt |
| Worktree is created | Unchanged | Child cwd/branch identity changes | Worktree receipt |

“Likely” is intentional: cache invalidation rules are not an OpenPI-owned
provider contract.

## 6. Role files, trust, and schema evolution

Agent Types are layered resources, not merely labels:

```text
package built-ins -> global definitions -> trusted project definitions
```

A higher-precedence definition replaces the complete same-name definition. A
malformed override must not silently reveal the lower-precedence, potentially
broader role. Unknown frontmatter keys should be rejected because ignoring a
misspelled restriction can widen capability by accident.

The same principle applies to schema evolution:

- adding a role is an additive selection change but can still change prompt
  bytes and model behavior;
- changing a role's tools is a capability change, not a cosmetic description
  change;
- removing a role must produce a clear diagnostic for callers that still send
  its exact enum name;
- changing a description should be reviewed for both meaning and cache-prefix
  impact;
- persisted workflow or replay data must not be interpreted as proof that a
  formerly available role still has the same tools.

The safe fallback is rejection or an explicit unavailable state, not a
broader role selected by name similarity.

## 7. Lessons from comparison implementations

The fixed comparison points in Issue #84 support the same division of labor,
even though their product surfaces differ.

| Implementation | Useful pattern | OpenPI lesson | Do not copy blindly |
| --- | --- | --- | --- |
| OpenAI Codex | Separate role summaries, full role instructions, and child/session state | Keep parent selection concise and child execution complete | Its internal role and tool-search protocol is not an OpenPI API |
| Apache Maka | Bounded tool catalogs, preset directories, request-shape and availability checks | Make large dynamic catalogs observable and bounded | A paginated catalog would add a new runtime surface before a use case exists |
| Oh My Pi | Minimal role projection, capability boundaries, stable request/prefix accounting | Keep role choice, tools, and cache identity distinguishable | Do not import its Agent OS or assume its cache fingerprint is portable |
| OpenPI | Strict dynamic enum, trust-gated role files, child allowlist/denylist, stable capability loading | Preserve fail-closed enforcement and Pi-native lifecycle ownership | Do not expand the parent schema with every child detail |

The comparison is about boundary patterns, not a ranking. Different harnesses
may use different provider protocols, prompt caches, and persistence models.

## 8. Evidence policy

Documentation and diagnostics should label the strength of a claim:

| Evidence level | Meaning |
| --- | --- |
| Source fact | Directly visible in pinned OpenPI source or tests |
| Documented contract | Stated by an official product or provider document |
| Runtime observation | Captured from one controlled invocation and its receipt |
| Correlation | A timing, size, or counter change that is consistent with a hypothesis |
| Inference | A reasoned interpretation that is not directly observable |
| Unknown | Not established by the available source or receipt |

Examples:

- “The generated role purpose is bounded to 240 UTF-8 bytes” is a source fact
  for the pinned implementation.
- “A stable schema can improve cache reuse” is a design inference.
- “This request had `cacheRead > 0`” is a runtime/provider receipt fact.
- “The provider reused exactly this visible role description” is unknown
  unless the provider exposes that evidence.

Do not turn latency, a warm child, a stable ID, or a zero cache-write counter
into proof of cache reuse or hidden-state sharing.

## 9. Minimal recommendation

For the current implementation:

1. Keep capability loading explicit by default and stable after the capability
   is loaded.
2. Keep the parent-facing role directory short, deterministic, and exact about
   names and enforceable capability classes.
3. Keep full prompts, tool policy, trust, model resolution, and lifecycle in
   the child execution boundary.
4. Keep child resource state in results and status tools, not in schema shape.
5. Keep provider cache and hidden reasoning state in the provider/Pi boundary.
6. Measure request shape and provider usage when optimizing cache behavior;
   do not introduce a cross-provider cache abstraction first.

If runtime work is later justified, add tests before changing the surface:

- schema hash/serialization is stable while child count changes;
- role order and byte bounds are deterministic;
- omitted role descriptions retain valid enum names;
- malformed trusted overrides fail closed;
- denylisted tools never become executable through a role file;
- capability/trust/reload boundaries refresh the roster;
- result disclosure reports the effective child surface without duplicating
  the full prompt;
- provider/model/effort changes are not mislabeled as parent schema changes.

## 10. Non-goals

- Adding a role directory query, pagination tool, or tool-search subsystem.
- Making every Agent Type's full prompt visible to the parent model.
- Guaranteeing cache hits, cache sharing, or provider portability.
- Treating role descriptions as security enforcement.
- Allowing resource instances to mutate the parent tool schema.
- Replacing Pi's Session, compaction, or child lifecycle ownership.
- Introducing a global cache registry for OpenPI.

## Sources

OpenPI implementation and current user-facing contract:

- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/subagents/src/prompt.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/subagents/src/agent-types.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/subagents/index.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/subagents/docs/agent-types.md
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/README.md

Comparison baselines fixed by Issue #84:

- https://github.com/openai/codex/tree/7b5b3bd5a2418a5e142449c9ab95e057d14bc98a
- https://developers.openai.com/codex/subagents
- https://github.com/apache/maka/tree/1d06330a1dc4995387eb7a91193187188c3ff71b
- https://github.com/can1357/oh-my-pi/tree/6c1209842323bb4713f127ac303c97fd043d585c
- https://github.com/tt-a1i/openpi/issues/84

Contribution and implementation tracking:

- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/CONTRIBUTING.md
- https://github.com/tt-a1i/openpi/pull/85