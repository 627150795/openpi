# Package-Wide Admission Lease Contract

Status: design-only first pass for [issue #159](https://github.com/tt-a1i/openpi/issues/159). This document defines a shared resource-admission boundary; it does not merge the existing managers, add a scheduler, or change current limits.

## Problem

OpenPI already enforces local limits independently:

- Direct Subagents reserve from separate normal and by-the-way pools;
- each Workflow run owns its own semaphore and agent-call budget;
- Background Terminals reserve their own process slots and spill resources.

Those local guarantees do not answer package-wide questions such as how many model sessions, processes, worktrees, or artifact bytes one Session is consuming. A prompt telling the model to open fewer jobs is not a runtime invariant.

## Ownership boundary

```text
SubagentManager ── local lifecycle, cancel, cleanup ──┐
Workflow run    ── local lifecycle, cancel, cleanup ──┼─ shared admission facts
Terminal manager ─ local lifecycle, kill, cleanup ────┘
```

The shared layer owns only:

- package-wide capacity facts;
- leases held by a known owner;
- atomic admission, rejection, and optional queueing;
- release and owner-loss recovery;
- bounded usage and blocking diagnostics.

Each capability owner remains authoritative for its own state machine, cancellation semantics, artifacts, and user-facing result. Admission must not become a second orchestration runtime.

## Lease identity

The future API is a contract sketch, not an implementation requirement:

```ts
type ResourceKind =
  | "model-session"
  | "process"
  | "worktree"
  | "artifact-bytes";

type LeaseOwner = {
  kind: "subagent" | "workflow" | "background-terminal";
  id: string;
  sessionId: string;
  generation: number;
};

type AdmissionLease = {
  id: string;
  owner: LeaseOwner;
  kind: ResourceKind;
  units: number;
  acquiredAt: number;
};
```

Required invariants:

- `id` is unique for one acquisition and is not reused after release;
- the owner identity includes the owning Pi Session and a generation so a stale child cannot release a newer lease;
- `units` is positive, finite, and bounded by configured request limits;
- a lease is either `held`, `released`, or `expired` in the admission ledger;
- the ledger never treats an owner-provided label or path as authority;
- all mutations are attributed to the owner and a Session boundary.

## Admission semantics

Every owner performs local validation first, then requests shared admission before starting the resource:

```text
validate local request
        │
        ▼
shared acquire ── accepted ──> start owner resource ──> release in finally
        │
        ├─ rejected: no resource starts
        ├─ queued: no resource starts until lease is granted
        └─ failed: owner reports an admission error
```

The first implementation should use immediate fail-closed rejection unless a concrete caller needs queueing. Queueing adds fairness, cancellation, shutdown, and starvation semantics; it must not be smuggled in as an incidental promise.

Acquisition is atomic across the requested units. If a request asks for three process units and only two are available, it receives zero units. Partial admission would make owner cleanup and user-visible capacity accounting ambiguous.

## Local limits and shared limits

Both layers remain active:

1. local owner limits prevent a capability from exceeding its own safe policy;
2. shared leases prevent the package-wide budget from being exceeded;
3. the stricter result wins;
4. releasing a local resource must release its corresponding shared lease exactly once.

The shared layer must not reinterpret a local Workflow agent-call budget as a process or memory budget. Different resource kinds remain separate until evidence justifies a common unit. Provider rate limits, memory, file descriptors, and disk bytes are not interchangeable just because they are all called “capacity.”

## Release, cancellation, and owner loss

Release is required on normal completion, failure, cancellation, timeout, and startup failure. Owners must release in their existing cleanup boundary rather than rely on garbage collection or a future reconciliation pass.

The shared layer must handle these races:

- release after a rejected acquire is a no-op with a diagnostic;
- duplicate release is idempotent and observable only as a counted duplicate;
- cancellation of a queued request removes it without consuming capacity;
- cancellation after grant releases the held lease through the owner cleanup path;
- owner shutdown marks outstanding leases as `expired` only after the owner generation is known dead;
- a stale generation cannot release or mutate a newer generation's lease;
- a process or child that fails before its native handle exists still releases the reservation.

An expiry sweep may be a recovery mechanism, but it is not proof that normal cleanup is correct. Expired leases must remain visible with owner, generation, reason, and detection time.

## Configuration changes

If a live configuration lowers a limit below current usage:

- do not revoke already-held leases silently;
- reject new acquisitions for that resource kind;
- expose `over_capacity` with current and configured units;
- let normal release return the system to capacity;
- require an explicit policy before terminating existing work.

If the configured limit is invalid or unavailable, fail closed for new acquisitions and keep existing owner lifecycles isolated.

## Fairness and priority

The first version should not invent a global priority system. Direct interactive work, Workflow fan-out, and Background Terminals have different product semantics, and a single numeric priority would hide tradeoffs.

If queueing becomes necessary, a later design must specify:

- owner-class fairness and starvation bounds;
- cancellation and Session shutdown of queued entries;
- whether interactive requests have reserved capacity;
- whether one Workflow run can monopolize shared capacity;
- stable ordering and an auditable reason for each grant.

No owner may bypass admission by calling another owner or by creating a resource through a lower-level helper.

## Observability

Operator-facing diagnostics should be bounded and read-only:

```text
resource kind:
configured units:
held units:
queued units:
available units:
over-capacity:
owners:
last rejection reason:
expired leases:
```

Diagnostics must identify the blocking resource kind and owner class without exposing prompts, secrets, raw model output, or unbounded paths. A model-visible summary is optional and must not create a resident tool or prompt tax for ordinary turns.

## Test matrix

Before runtime adoption, tests must cover:

- concurrent acquisitions cannot exceed each resource-kind total;
- local and shared limits both reject safely;
- multi-Workflow plus Direct Subagent plus Terminal usage accounts for the sum;
- rejected and cancelled requests consume no capacity;
- normal, failed, timeout, and startup-abort paths release exactly once;
- duplicate and stale-generation releases cannot free another owner's lease;
- owner loss leaves a bounded, auditable recovery record;
- configuration shrink rejects new work without killing existing work;
- diagnostics show held, queued, released, expired, and blocking states;
- a shared-layer failure does not corrupt the owner manager's state machine.

Stress tests should separately measure provider throttling, file descriptors, memory, disk, worktree count, and interactive latency. A single green concurrency test does not prove that one weighted unit models all of those resources.

## Non-goals

- no merge of Subagent, Workflow, or Background Terminal managers;
- no global agent scheduler or decomposition policy;
- no automatic priority inferred from prompt text;
- no increase to existing local limits;
- no claim that one weighted governor covers every physical resource;
- no model tool required for ordinary admission;
- no replacement of native owner cleanup or artifact ownership.

Until these invariants and the combined-owner tests exist, the current local limits remain the shipped behavior and this contract is a design reference only.
