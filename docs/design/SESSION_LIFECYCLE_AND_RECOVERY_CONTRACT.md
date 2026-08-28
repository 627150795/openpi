# Session Lifecycle and Recovery Contract

Status: documentation contract. This document describes the current Pi-native
ownership boundaries and does not add a Session store, replay engine,
checkpoint engine, rollback behavior, or provider continuation layer.

Coverage: planned 5, covered 5, failed `[]`.

## Executive invariants

OpenPI extends Pi at its existing lifecycle seams. Pi remains the sole owner
of top-level Session identity, transcript persistence, branch selection,
resume, fork, and compaction. OpenPI may persist package-owned Workflow
artifacts and branch-scoped custom entries, but it must not create a second
Session store or infer execution completion from labels, dashboards, process
disappearance, or provider state.

Workflow Replay means persisted-result reuse for a previously proven read-only
child invocation. It is never Session resume, live child rejoin, operator
memory restoration, provider cache reuse, or tool-call re-execution.

Canonical execution facts, model-visible context, and operator-facing UI are
separate projections. A lower-fidelity projection cannot override stronger
durable evidence.

## Evidence and revision policy

The source audit that motivated this document used these bounded references:

| System | Revision or version | Evidence status |
| --- | --- | --- |
| OpenPI | `2a69d3f32994da4123f1312b7fa84ef3d6119be1` | fixed source audit |
| Pi | `@earendil-works/pi-coding-agent@0.84.3` | installed source inspected |
| Codex | `a9e447a69dee4f2789dd8d8c776e314772c1f049` | fixed source inspected |
| Gemini CLI | `812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8` | fixed source inspected |
| Hermes | `cbd8de8ad64530be01efea23b7764d5c37c634ed` | fixed source inspected |
| Grok Build | `c2ad97f87aea4303b6000a2c22128bc91ee76c9b` | fixed source inspected |
| OpenCode | `8615731d46153dd29b89e205fb55b2cc16205cb0` | fixed source inspected |
| Claude Code | official rolling documentation | implementation is proprietary |

The labels used below are deliberate:

- **Fixed fact** — established by a bounded source revision or installed
  package.
- **Rolling documentation** — current public documentation, not a pinned
  implementation guarantee.
- **Inference** — an architecture conclusion derived from the stated facts.
- **Unknown** — not established by the evidence and not safe to assume.

Before diagnosing installed behavior, provider compatibility, a manual Pi
smoke, or a UI result, use the runtime provenance procedure in the README and
prove the checkout revision and the single OpenPI source reported by `pi list`.
The fixed-source audit above is not a claim about whichever package happens
to be loaded in a later runtime.

## Planes and canonical sources

| Plane | Canonical identity/source | Meaning | Must not be confused with |
| --- | --- | --- | --- |
| Pi Session transcript | JSONL header UUID, entry `id`/`parentId`, parsed current leaf | Durable conversation tree and active path | Provider conversation, Workflow run, Git history |
| Pi model context | Pi's session-context projection | Messages sent to the provider | Full canonical transcript |
| OpenPI branch state | Pi `custom` entries on the active branch | Tasks, Goal, Plan, and watermarks | An independent database |
| Live runtime | Pi `AgentSession`, child owner, process, waiter | In-memory ownership and active execution | Durable completion evidence |
| Workflow execution | Run ID and `{runId, callIndex}` | Invocation ledger, results, graph, delivery | Pi Session transcript |
| Workflow Replay | Journal fingerprint and persisted successful result | Safe reuse of one proven result | Session resume or tool re-execution |
| Provider state | Response IDs, sockets, caches, server state | Transport/provider-private state | Durable Session identity |
| Filesystem/Git | Actual files, metadata, index, worktree, refs | Workspace truth and versioned state | Transcript branch or model memory |
| UI projection | Labels, spinners, progress, dashboard rows | Operator convenience | Canonical execution status |
| Delivery projection | Stable delivery ID and persisted receipt | Whether a terminal result reached the parent | Whether execution succeeded |

No operation in one plane proves a state change in another plane.

## Identities and ownership

### Pi-owned identities

- The Session UUID is stored in the JSONL header.
- Transcript entries have session-scoped IDs and parent links.
- The active leaf is reconstructed from parsed JSONL ordering and the parent
  chain; it is not a separately durable pointer. A tree selection without a
  later append is not guaranteed to survive restart.
- `/fork` and `/clone` create a new Session file and UUID. Copied entry IDs
  remain scoped to the new Session; later writes do not propagate.
- Model context is derived from the selected branch, compaction entries,
  summaries, and retained tail.
- `/resume`, `/tree`, `/fork`, `/clone`, provider/model selection, Skills,
  Trust, extension events, and Session shutdown remain Pi responsibilities.

The JSONL path is storage location, not the complete logical identity. Provider
response IDs and cache keys cannot replace the Pi Session identity.

### OpenPI-owned identities

- Workflow run ID.
- Workflow invocation `{runId, callIndex}`.
- Run-relative result artifacts such as `agent-results/agent-N.json`.
- Replay fingerprint covering prompt, role/schema, resolved model/provider/
  effort, canonical cwd, repository state, resources, and Trust.
- Run-local opaque result references.
- Stable completion delivery ID and persisted receipt.
- Direct-child handle and its Pi child Session while the owner is alive.
- Branch-scoped Tasks, Goal, and Plan custom entries.

Workflow artifacts may include `workflow.json`, `transcripts.json`,
`journal.json`, child result files, and `result.json`. They are an execution
plane, not a parallel Pi Session store: they do not own top-level Session
identity, `/resume`, `/tree`, `/fork`, provider selection, or parent lifecycle.

### Provider identity is not canonical Session state

Provider response IDs, websocket state, prompt caches, and server-side
conversations may optimize transport, but bounded evidence does not make them
the canonical Session. They cannot prove resume, child completion, fork
continuity, or Workflow recovery.

## Lifecycle semantics

### Pi Session

```text
new
  -> in-memory entries
  -> first persistence
  -> active
  -> append entry / select tree node / compact
  -> active with a changed branch or context projection
  -> fork or clone
  -> independent new Session
  -> shutdown
  -> closed
  -> open/resume
  -> active, reconstructed from JSONL
```

Compaction appends a transcript entry; it does not erase earlier entries.
`/tree` changes the in-memory active leaf and does not roll back files or Git.
`/fork` and `/clone` copy a conversation boundary, not a workspace or provider
conversation. Resume hydrates a new runtime; it is not live rejoin.

Pi append and direct rewrite paths are synchronous in the audited version, but
`fsync`, transaction markers, and exact torn-tail repair were not established.
Malformed JSONL recovery and hard-kill durability are therefore **unknown**,
not guarantees.

### Direct child

```text
reserved
  -> resources loaded and Trust resolved
  -> extensions bound and child policy checked
  -> running
  -> settled(success | error | cancelled)
  -> result persisted/projected
  -> shutdown requested
  -> abort -> session_shutdown -> dispose
```

Timeout and error never become success. Parent-only tools remain excluded even
when an agent type requests them. The child owns its bounded Pi loop and local
tool calls; the parent owns delegation, cancellation, synthesis, and the
decision that the overall user task is complete. Child completion alone is not
parent-task completion.

### Workflow invocation

```text
intent: requested
admission: pending -> claimed | replayed | rejected
execution: pending -> running -> settled
                              \-> uncertain (recovery only)
outcome: success | error | uncertain
```

Transitions are monotonic. A persisted nonterminal invocation without a live
owner becomes `uncertain` after process loss. OpenPI does not guess whether the
call failed before or after an external effect and does not automatically retry
uncertain work.

### Workflow delivery

Execution and delivery are independent:

```text
held-for-inline -> consumed-inline
pending -> delivered
pending -> pending on transport or receipt persistence failure
```

After restart, an old inline waiter cannot exist, so `held-for-inline` becomes
`pending`. Delivery is at least once. A duplicate after process loss carries
the same stable delivery ID; it is not proof that execution ran twice.

### Workflow Replay

```text
replay request
  -> load prior successful journal entry
  -> validate version and integrity
  -> recompute complete execution/workspace fingerprint
  -> prove read-only and non-operator
  -> replay persisted result
  -> otherwise cache miss and execute normally
```

On a hit, Replay does not start a child, make a provider call, revive an old
operator Session, restore a result reference, or re-execute a tool call. It is
per-invocation persisted-result reuse. Missing, corrupt, old, incomplete, or
unsafe journal data degrades to a real execution rather than a guessed hit.

Operators reuse one in-memory child Session only inside one Workflow run. The
first activation freezes model, role/tool surface, effort, structured mode,
and cwd. Operator state is not durable Agent memory and cannot Replay.

## Operation matrix

| Operation | Transcript / identity | Model context | Runtime | Filesystem / Git | Provider state |
| --- | --- | --- | --- | --- | --- |
| Pi resume | Same Session UUID and file | Rebuilt from active branch | New runtime | Unchanged | New request context; old chain not assumed |
| Live rejoin | Same identity only when a compatible owner still exists | Existing live context | Existing owner | Unchanged | May reuse live transport |
| Pi `/tree` | Same file, new in-memory leaf | Active path changes | Same runtime | No rollback | New request context |
| Pi `/fork` / `/clone` | New Session UUID/file | Selected history copied | Independent runtime | No Git branch | Not inherited canonically |
| Compaction / context pivot | Appends or uses Pi compaction | Summary plus retained tail | Same parent Session | Unchanged | Cache consequences only |
| Workflow Replay hit | No Session resume | Persisted result is reprojected | No child/provider call | Fingerprint must remain complete | Provider cache irrelevant |
| Workflow restart recovery | Parent restored separately | Terminal projection may deliver | Old child/operator not reconstructed | Existing effects remain | Non-canonical/unknown |
| Direct child rejoin | Not promised across restart | Not available if owner is lost | Usually unavailable | Effects remain | Not promised |
| Git rollback | No transcript change | Model may remember reverted work | Runtime unchanged | Git/worktree changes | Unchanged |
| Filesystem snapshot restore | No transcript change | Context may become stale | Runtime unchanged | Only covered files restore | Unchanged |

Transcript operations never imply filesystem, Git, network, database, child, or
provider rollback.

## Filesystem, Git, and side-effect boundaries

The rollback domains are independent:

1. Pi transcript branch and compaction history.
2. OpenPI Workflow invocation and result artifacts.
3. Workspace files, index, worktrees, and Git refs.
4. Provider response chains, caches, and server-side state.

Consequences:

- `/tree`, `/fork`, `/clone`, compaction, and context pivot do not undo writes,
  edits, shell commands, network requests, databases, or child effects.
- Git reset or worktree cleanup does not delete transcript entries describing
  code that is now reverted.
- Restoring files without updating context can leave the model reasoning from
  obsolete facts.
- Replay is forbidden when workspace identity is incomplete or writing cannot
  be excluded; the call becomes a cache miss and runs for real.
- Worktree manifests are preservation evidence, not Replay receipts. They do
  not prove that untracked, ignored, or external side effects are absent.
- Dirty, untracked, ignored, detached, timed-out, or uninspectable work is
  preserved rather than silently deleted.

## Compaction and model context

Pi compaction appends a summary/checkpoint entry while retaining canonical
history. Later model context uses the summary and retained tail, so omitted
details are not guaranteed to remain behaviorally available. A summary is a
model-facing projection, not a replacement for files, tests, artifacts, or
receipts.

OpenPI `context_pivot` uses Pi compaction semantics to create a self-contained
phase brief. It is parent-only, within the same Session, not a fork, not a new
Session, not a rollback, and not deletion of canonical history.

Workflow parents receive bounded result projections. Full successful child
outputs remain in run artifacts; a result reference proves provenance but not
that all evidence fit in the parent prompt. Operators preserve conversational
state only in memory and only inside one run.

## Parent/child authority

The parent owns user interaction, Pi Session lifecycle, delegation, Tasks,
Goal, Plan Mode, context pivot, Workflow scheduling, delivery, configuration,
and final synthesis.

The child owns its bounded Pi loop, local tools, transcript, output, acceptance
evidence, and orderly shutdown within the deadline.

The runtime-enforced child boundary excludes:

- Subagent and Workflow orchestration;
- parent Tasks, Goal, and Plan completion controls;
- setup/configuration mutation;
- parent context pivot;
- user interaction and handoff;
- parent background-process management.

Only explicitly classified read-only package tools may be child-safe. The drift
guard covers inline and factory registrations and fails closed on an
unclassified tool. A child `done` label is not terminal evidence; parent
conclusions use settled outcome, persisted result/artifact, required acceptance
evidence, and delivery state.

## Crash recovery, retention, and deletion

| System | Durability boundary | Recovery | Retention / deletion |
| --- | --- | --- | --- |
| Pi Session | Synchronous append/direct rewrite; fsync and transaction marker unknown | Rebuild readable JSONL; torn-tail guarantee unknown | Session-file deletion/trash; no branch-local deletion contract |
| Workflow | Atomic artifact writes and persisted invocation checkpoints | Nonterminal ownerless call becomes `uncertain`; corrupt Replay becomes a miss | Partial artifacts are preserved; retention remains separate from Sessions |
| Delivery | Stable delivery ID; receipt write can fail after transport acceptance | Pending retry and possible same-ID duplicate | Terminal artifact remains authoritative |
| Direct child | Bounded abort, shutdown, and dispose | Timeout/error remains visible; no cross-process rejoin promise | Transcript/artifacts and dirty isolated work may remain |
| Worktree | Cleanup receipt records removal or preservation | Unknown cleanup preserves the scene | No automatic merge, apply, or force-delete |
| Provider | Provider-specific and outside OpenPI ownership | Missing terminal receipt is `uncertain` | Provider policy applies; OpenPI retains only bounded references |

If durable evidence cannot distinguish success, failure, cancellation, or
whether a side effect occurred, the result is `uncertain`; it is never inferred
as success and is not automatically repeated.

## Evidence hierarchy and observability

From strongest to weakest:

1. persisted terminal execution record with stable identity;
2. persisted successful result artifact;
3. persisted delivery receipt;
4. accepted tool result tied to a transcript entry;
5. terminal runtime event such as `agent_settled` or `TurnComplete`;
6. process exit;
7. provider response;
8. dashboard, label, spinner, phase name, or notification.

Lower levels cannot override contradictory higher-level evidence. Workflow
graphs, dashboards, and UI rows are projections. They cannot claim, run, retry,
cancel, or complete an invocation.

Authoritative Workflow execution evidence includes run ID, invocation identity,
admission/execution state, terminal outcome, `workflow.json`, successful child
result artifacts, and `result.json` when present. Delivery evidence is separate
and includes delivery ID, status, attempts, and last error.

## Exact ownership boundary

### Pi owns

- top-level Session UUID and JSONL storage;
- transcript entry IDs and parent links;
- active branch reconstruction and native compaction;
- `/resume`, `/tree`, `/fork`, and `/clone`;
- model context reconstruction and provider/model selection;
- Skills, Trust, extension events, and Session shutdown.

### OpenPI owns

- package custom entries for Tasks, Goal, Plan state, and watermarks;
- direct-child lifecycle and capability intersection;
- Workflow run/invocation IDs, ledger, graph, journal, and artifacts;
- safe persisted-result Replay;
- run-local result references and operators;
- completion delivery and stable receipts;
- worktree isolation/preservation receipts;
- context-pivot policy through Pi compaction;
- UI projections for OpenPI-owned facts.

### OpenPI must not own

- an alternative canonical parent transcript;
- another implementation of Session resume, fork, tree, or compaction;
- provider conversation identity or generic provider cache state;
- generic filesystem rollback;
- completion inferred from presentation state;
- durable reconstruction of in-memory child/operator conversations;
- Replay of writable or incompletely fingerprinted calls.

## Relationship to nearby Issues

This is a shared documentation contract, not a replacement implementation
ticket. The narrower decisions remain with their own Issues:

- [#154](https://github.com/tt-a1i/openpi/issues/154) owns whether exploratory
  checkpoint/rewind is worth implementing.
- [#190](https://github.com/tt-a1i/openpi/issues/190) owns the detailed
  compaction comparison.
- [#157](https://github.com/tt-a1i/openpi/issues/157) owns recoverable resource
  references.
- [#160](https://github.com/tt-a1i/openpi/issues/160) and
  [#71](https://github.com/tt-a1i/openpi/issues/71) own delivery and completion
  receipts.
- [#110](https://github.com/tt-a1i/openpi/issues/110) owns multi-file Workflow
  terminal atomicity.
- [#112](https://github.com/tt-a1i/openpi/issues/112),
  [#119](https://github.com/tt-a1i/openpi/issues/119), and
  [#127](https://github.com/tt-a1i/openpi/issues/127) own Replay/Acceptance
  policy and its migration.

This document supplies shared vocabulary, ownership, operation matrices, and
exclusions. It must not reopen those scopes without a separately proven
contradiction.

## Primary source map

OpenPI fixed-source references:

- `docs/design/WORKFLOW_INVOCATION_GRAPH.md`
- `extensions/shared/child-session.ts`
- `extensions/workflows/artifacts.ts`
- `extensions/workflows/journal.ts`
- `extensions/workflows/replay-safety.ts`
- `extensions/workflows/result-delivery.ts`
- `extensions/workflows/dashboard.ts`
- `extensions/workflows/runner.ts`
- `extensions/goal/`
- `extensions/tasks/`
- `extensions/context-pivot/`
- `skills/subagents/SKILL.md`
- `skills/workflows/SKILL.md`
- `skills/workflows/REFERENCE.md`

Pi installed references:

- `docs/session-format.md`
- `docs/sessions.md`
- `docs/compaction.md`
- `docs/extensions.md`
- `docs/sdk.md`
- `dist/core/session-manager.js`
- `dist/core/agent-session.js`

External comparisons are evidence-labelled and revision-pinned where source
was available. Claude Code is cited only through its rolling public contracts;
its implementation atomicity and private runtime state remain unknown.

## Acceptance coverage

- One lifecycle contract document exists under `docs/design/`.
- Pi JSONL is the sole canonical top-level Session transcript.
- Workflow artifacts are an execution plane, not a Session store.
- Transcript, context, runtime, Workflow, provider, filesystem/Git, UI, and
  delivery planes are separated.
- Session, entry/leaf, child, run, invocation, Replay, result-reference, and
  delivery identities are documented.
- Resume, live rejoin, tree, fork, clone, rewind, checkpoint, compaction, and
  Replay are distinguished.
- Replay is persisted-result reuse only and never provider/cache/session
  restoration or tool-call re-execution.
- Transcript operations do not imply filesystem, Git, network, database, or
  child rollback.
- Parent/child authority, fail-closed tools, terminal evidence, delivery
  at-least-once behavior, uncertainty, retention, and deletion boundaries are
  explicit.
- Fixed, rolling, inference, and unknown evidence labels are preserved.
- No runtime abstraction or second persistence/control plane is introduced.
