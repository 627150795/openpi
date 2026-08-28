# Background Execution Lifecycle Contract

Status: documentation contract. This document separates the lifecycle and
evidence boundaries of Direct Subagent, Workflow, and Background Terminal. It
does not introduce a shared producer state machine, a message broker, a global
job database, or a second orchestration runtime.

## Decision

These execution planes intentionally have different owners:

- Direct Subagent is a process-local child-session manager.
- Workflow is the durable run, artifact, journal, replay, and delivery plane.
- Background Terminal is a process-local native child-process manager.
- Pi owns the parent Session, provider calls, extension lifecycle, and message
  transport.
- UI components only project state; they do not own scheduling, settlement,
  cleanup, or model consumption.

A status in one plane never proves a status in another plane.

The common vocabulary is:

~~~text
admission
  -> execution and progress
  -> cancellation or timeout
  -> terminal snapshot
  -> artifact commit
  -> cleanup evidence
  -> completion transport
  -> model consumption
  -> operator projection
~~~

Each arrow is a boundary. A successful execution may have a failed artifact
write. A delivered message may not have been consumed by a later model turn.
A killed process may still have uncertain descendants or external effects.

## 1. Evidence planes

| Plane | What it answers | What it does not prove |
| --- | --- | --- |
| Admission | Was capacity or a run slot accepted? | That a child or process started |
| Execution | Did the owned runtime produce progress? | That all external effects stopped |
| Terminal snapshot | Which local outcome was selected? | Exactly-once execution or cleanup |
| Artifact | Are declared bytes readable? | That the bytes are complete or consumed |
| Cleanup | Which owned resources were reclaimed? | That third-party effects ended |
| Transport | Did the client accept a completion envelope? | That a provider or model saw it |
| Consumption | Did a later model turn include it? | That the model attended to or obeyed it |
| UI projection | What did the operator interface render? | Canonical execution or delivery truth |

The minimum useful status set is therefore:

~~~text
executionStatus
executionOwnerLive
artifactStatus
cleanupStatus
deliveryTransportStatus
deliveryReceiptStatus
modelConsumptionStatus
operatorProjectionStatus
~~~

One boolean such as ok is not sufficient for all of these questions.

## 2. Canonical ownership

| Owner | Owns | Does not own |
| --- | --- | --- |
| Pi parent Session | Session history, provider turns, extension hooks, parent message transport | Child terminal state or child external effects |
| Direct Subagent manager/backend | Child registry, capacity, child AgentSession, event bridge, local delivery map | Durable restart recovery |
| Workflow coordinator/controller | Run id, sandbox, limits, child calls, cancellation, terminal persistence | A universal producer lifecycle for other planes |
| Background Terminal manager | Native process, process group, output buffers, timeout, kill and local result map | A general filesystem or OS sandbox |
| Artifact/cleanup helpers | Run-relative files, spill output, worktree provenance and reclamation | Execution success or model consumption |
| UI | Footer, dashboard, transcript and status rendering | Scheduling, cancellation authority or canonical state |

A child id, run id, result reference, artifact path, or completion message is
data. It never widens the receiving Session's tools, Trust, filesystem access,
provider credentials, or approval policy.

## 3. Direct Subagent

### 3.1 Admission and execution

Direct Subagent is always detached from the parent tool call. The spawn call
returns an id; explicit waiting is a later synchronization operation.

The manager reserves capacity before asynchronous startup:

- ordinary model children are bounded by the ordinary child pool;
- by-the-way children use a separate smaller pool;
- tracked entries and retained results are bounded separately.

The child backend creates a fresh Pi AgentSession with its own resource loader,
settings, extension registry, and child-specific tool policy. It translates
child events into a normalized stream:

~~~text
RunStarted
AssistantDelta / AssistantMessage
ToolStart / ToolUpdate / ToolEnd
QueueChanged / UsageChanged / MetaChanged
RunSettled(Completed | Failed | Interrupted)
~~~

The manager snapshot intentionally collapses the public status to:

~~~text
running | done | error
~~~

The backend keeps the more precise terminal distinction:

- Completed with final text;
- Failed with an error and optional partial text;
- Interrupted with optional partial text.

The local status and backend outcome are not evidence of provider-side
cancellation or external side-effect completion.

### 3.2 Waiting, cancellation, and late effects

subagent_wait consumes a result when the caller explicitly asks for it. It
does not own the child and it does not turn a caller timeout or interruption
into child cancellation.

Cancellation asks the child Session to abort. If cooperative cancellation does
not finish within the manager's bounded shutdown policy, the child is settled
as interrupted and its scope is disposed. This selects a local outcome; it
does not prove that every provider request, extension, process, or external
side effect stopped at the same instant.

A first-response watchdog covers initial progress. It is not a complete
deadline for every later provider turn or tool call.

### 3.3 Delivery and recovery

The manager uses a process-local pending map:

- a child that settles while the parent is busy remains pending;
- parent settlement drains the pending batch;
- an explicit wait consumes the same id and prevents duplicate delivery;
- a synchronous delivery failure restores the batch for a later boundary.

This gives local first-consumer behavior only. There is no durable Subagent
completion inbox or execution owner rejoin after process restart. A child
Session file may remain available to Pi, but OpenPI does not reconstruct the
manager entry, ownership, pending delivery, or live child execution.

## 4. Workflow

### 4.1 Separate intent, admission, and execution

Workflow records independent axes:

~~~text
intent:     requested
admission:  pending -> claimed | replayed | rejected
execution:  pending -> running -> settled | uncertain
~~~

A replayed invocation does not start a child. A rejected invocation did not
execute. A persisted nonterminal invocation whose owner is lost becomes
uncertain; it must not be guessed as success, failure, or cancellation.

The Workflow controller owns run-wide call limits, concurrency, queueing,
abort propagation, and bounded settlement. It does not become the lifecycle
owner for Direct Subagent or Background Terminal.

### 4.2 Run and agent states

A Workflow run reports a product-level status such as:

~~~text
running | completed | failed | aborted | uncertain
~~~

Each invocation additionally keeps admission and execution state. An agent
result may be done, failed, or uncertain. These are not interchangeable with
the run's delivery state.

A Workflow may complete its execution while:

- one result artifact is missing;
- cleanup is partial or not yet proven;
- completion delivery is pending;
- transport was accepted but no later model consumption occurred.

### 4.3 Launch and wait policy

Workflow is the only one of the three planes whose default foreground or
background behavior depends on the host:

| Host or option | Meaning |
| --- | --- |
| Interactive TUI/RPC with later delivery | Detached by default |
| Print or automation without a completion sink | Inline by default |
| Explicit wait true | Inline synchronization barrier |
| Interrupted inline wait | Releases the waiter; does not own or cancel the run |
| workflow_stop or Session shutdown | Requests run cancellation |

The deprecated background compatibility option is not a separate lifecycle
model. It maps to the canonical host policy and cannot be used to claim that a
run is durable across all process restarts.

### 4.4 Cancellation and forced settlement

A Workflow stop or parent Session shutdown aborts the controller and child
work. A bounded settlement barrier waits for owned tasks as far as the runtime
can observe. If the barrier expires, the run may be force-settled
conservatively.

Forced settlement means that the controller selected a terminal record. It
does not prove that:

- every child stopped;
- every provider request was cancelled;
- every process descendant exited;
- every tool or third-party effect ended;
- cleanup completed;
- the parent model consumed the completion.

Late tasks must not overwrite the selected terminal record. Cleanup and external
effects remain separate evidence.

### 4.5 Artifacts and replay

Workflow stores run-relative artifacts for scripts, agent results, transcripts,
terminal details, and delivery state. An artifact path is provenance, not a
model-readable capability or a guarantee that the file is complete.

A same-run result reference held only in memory is not restart-resolvable.
Replay returns a persisted result without starting another provider request, so
replay must not be described as a prompt-cache hit or a fresh execution.

The terminal manifest and dependent artifacts are separate writes. A crash
between them can leave a terminal execution record with incomplete side
artifacts. Readers must report those planes independently.

### 4.6 Completion delivery

Workflow completion has a stable delivery identity and a durable pending/
accepted state. Its transport guarantee is at-least-once:

~~~text
terminal artifact
  -> delivery = pending
  -> transport attempt
  -> receipt = accepted
  -> later model turn may consume it
~~~

If transport succeeds but receipt persistence fails, recovery may send the
same delivery id again. Duplicate transport is possible; stable identity lets
a consumer deduplicate. A recorded delivered state means synchronous
sendMessage returned and that receipt was recorded. It does not prove
provider acceptance, model inclusion, model attention, or human rendering.

## 5. Background Terminal

### 5.1 Process ownership

Background Terminal is always detached and starts a native child process. The
manager owns:

- the process and, where available, its process group;
- ignored stdin;
- separate bounded stdout and stderr buffers;
- optional full-output spill files;
- timeout and kill escalation;
- the process-local terminal registry and read model.

Terminal status/watch operations observe snapshots. They do not become a
synchronization waiter with ownership over the process.

### 5.2 Terminal states

The public terminal status is:

| Status | Meaning |
| --- | --- |
| running | Process has not settled |
| done | Process exited with code zero |
| failed | Spawn/runtime failure or non-zero exit |
| killed | Explicit kill or Session teardown selected termination |
| timed_out | The configured deadline initiated termination |

A snapshot keeps command, title, resolved working directory, pid when known,
exit code or signal, bounded error notes, elapsed timestamps, and both output
views. A stream view may be truncated in memory while retaining a full spill
path when spilling succeeds.

Natural exit, kill, timeout, stdio close, and spill flush are separate events.
The manager waits for the observable close/flush boundary when possible, but
bounded teardown can still leave process-tree or filesystem uncertainty.

### 5.3 Kill and timeout

A kill request attempts process-tree termination and escalates within bounded
deadlines. A direct-child fallback or failed signal must not be reported as a
confirmed process-tree kill.

A timeout is a termination cause, not proof that the process tree was
terminated. A kill result can therefore include termination failure and
preserved partial output.

A process group or Windows tree-kill helper is an ownership mechanism. It is
not an OS sandbox, filesystem boundary, permission model, or durable recovery
owner.

### 5.4 Delivery and cleanup

A settled terminal can be retained while its completion is waiting for parent
delivery. The manager's notification and result maps are process-local; there
is no general durable terminal completion inbox or restart rejoin.

Spill-file cleanup, worktree reclamation, and process termination each need
their own receipt. A clean exit does not prove cleanup; cleanup success does
not prove command success.

## 6. Session transitions and owner loss

These events have different meanings:

| Event | Meaning for background execution |
| --- | --- |
| /new | New parent Session; old process-local owners shut down |
| /resume | Hydrate Session history into a fresh runtime; do not rejoin live children |
| /fork | Create a new branch/snapshot; do not transfer live ownership |
| /reload | Reload extensions/resources; dispose old owners and reject stale events |
| Process restart | Remove every process-local owner |

Workflow can reconstruct persisted run records, classify stale running work as
uncertain, and restore pending delivery. It does not resume old child
execution. Direct Subagent and Terminal have no equivalent durable execution
recovery.

A general owner/session/generation epoch fence does not currently exist across
all producers. Issue #160 owns any future thin completion-inbox contract and
must not be claimed as already implemented.

## 7. Isolation and authority

Child Pi Sessions, isolated Git worktrees, process groups, and result artifact
paths are different mechanisms:

- a child Session has a fresh prompt/resource/tool projection;
- a worktree isolates Git paths, not the operating system;
- a process group improves termination scope, not permission scope;
- an artifact path identifies stored output, not a capability to read or write
  arbitrary files;
- a run or child id carries identity, not authority.

Tool allowlists, Trust decisions, approvals, filesystem permissions, provider
credentials, and network policy remain parent/child runtime boundaries. A
completion envelope cannot widen them.

## 8. Receipts and failure vocabulary

Use these terms precisely:

- requested: caller expressed intent;
- admitted: capacity was claimed;
- running: execution owner exists;
- cancelled: cancellation outcome was selected locally;
- timed out: a deadline initiated termination;
- settled: the owner selected a terminal snapshot;
- uncertain: the available evidence cannot classify the outcome;
- artifact committed: declared bytes are readable;
- cleanup complete: owned cleanup has a receipt;
- delivery accepted: transport returned successfully;
- model consumed: a later model request included the message;
- operator rendered: UI displayed a projection.

Avoid exactly-once claims unless the scope is named:

| Scope | Safe claim |
| --- | --- |
| Local terminal guard | At-most-once selection of the local terminal state |
| Workflow transport | At-least-once delivery with stable id |
| Direct/Terminal pending map | Process-local first-consumer behavior |
| External side effects | No exactly-once guarantee |
| Model consumption | Usually unknown |

## 9. Related issue ownership

This document is terminology and evidence only. Runtime work remains with its
owner issue:

- #159: package-wide admission leases and resource limits;
- #160: thin completion inbox, owner routing, epoch, deduplication, and wake;
- #71: Workflow terminal persistence and delivery inconsistency;
- #74: interactive Workflow detach/inline defaults;
- #110: terminal artifact-set atomicity;
- #114: forced-settlement cleanup provenance;
- #116: unabortable Workflow child startup;
- #171: later-turn model no-progress watchdogs;
- #173 and #174: terminal UI projections;
- #176: Direct Subagent production-adapter lifecycle coverage;
- #193: Pi Session and Workflow replay semantics.

No producer lifecycle implementation moves into this document.

## 10. Minimal recommendation

1. Keep three producer owners and the existing Pi-native Session boundary.
2. Fix lifecycle bugs in the owner module and owner issue, not in a universal
   state machine.
3. Let #160 define only shared delivery envelopes and receipts if concrete
   cross-producer use requires them.
4. Keep Workflow as the durable run/outbox plane; do not make Direct Subagent
   or Terminal durable by default.
5. Require every status, UI label, test, and report to name the evidence plane
   it proves.
6. Measure late effects, artifact gaps, cleanup receipts, and duplicate
   delivery rather than hiding them behind one successful flag.

## 11. Non-goals and unknowns

Non-goals:

- No unified producer state machine.
- No second orchestration runtime, daemon, scheduler, or message broker.
- No global background-job database.
- No durable Direct Subagent or Terminal execution resume.
- No exactly-once external side effects or universal delivery promise.
- No automatic retry of uncertain execution without an explicit policy.
- No worktree claim as OS sandbox.
- No child reference that widens authority.
- No polling loop as a substitute for event delivery.
- No inference of model consumption from transport or rendering.

Unknown until a separate runtime receipt proves it:

- complete process-tree termination after a force deadline;
- all provider/tool/extension side effects after cancellation;
- crash atomicity across Workflow terminal records and all artifacts;
- delivery behavior between transport acceptance and receipt persistence;
- consumer acknowledgement beyond a transport receipt;
- third-party extension cleanup guarantees;
- a cross-producer owner epoch fence;
- complete Windows descendant behavior;
- private delivery and restart semantics of other agent products;
- whether a loaded runtime matches the fixed source without reload/smoke
  verification.

## 12. Source map

OpenPI implementation:

- [Direct Subagent manager](../../extensions/subagents/src/manager.ts)
- [Direct Subagent backend](../../extensions/subagents/src/backends/pi.ts)
- [Direct Subagent delivery](../../extensions/subagents/src/result-delivery.ts)
- [Workflow controller](../../extensions/workflows/controller.ts)
- [Workflow invocation ledger](../../extensions/workflows/invocation-ledger.ts)
- [Workflow artifacts](../../extensions/workflows/artifacts.ts)
- [Workflow delivery](../../extensions/workflows/result-delivery.ts)
- [Workflow host and run lifecycle](../../extensions/workflows/index.ts)
- [Background Terminal domain](../../extensions/background-terminals/src/domain.ts)
- [Background Terminal manager](../../extensions/background-terminals/src/manager.ts)
- [Background Terminal delivery](../../extensions/background-terminals/src/result-delivery.ts)

Related design contracts:

- [Workflow invocation graph](WORKFLOW_INVOCATION_GRAPH.md)
- [Session lifecycle and recovery](SESSION_LIFECYCLE_AND_RECOVERY_CONTRACT.md)

The source map is evidence for the current implementation only. Runtime
changes must update the relevant contract and targeted tests together.
