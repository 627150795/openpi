# Completion Inbox Contract

Status: design contract. This document defines a thin delivery plane for
completion events produced by Direct Subagents, Background Terminals, and
Workflows.

The inbox routes and accounts for completion envelopes. It does not own the
execution state machine, the exact result artifact, the process lifecycle, or
the provider request. This document does not change runtime behavior.

## Decision

Separate these four concerns:

1. **Producer:** owns execution, terminal status, exact result, and artifact.
2. **Completion inbox:** owns destination Session routing, stable delivery
   identity, owner epoch, pending state, retry, and per-item receipt.
3. **Model consumption:** owns whether the delivered result is interpreted or
   acted on in a model turn.
4. **UI projection:** displays bounded status and delivery facts; it is not the
   delivery authority.

The inbox may batch envelopes for transport, but each envelope keeps its own
identity and receipt. A successful transport call is not the same as model
consumption. If the process can disappear between those events, the honest
delivery guarantee is at-least-once with stable IDs and duplicate recognition,
not distributed exactly-once.

## 1. Why execution and delivery are different

An execution can be complete while its result is still pending delivery. It can
also be delivered while the parent model has not yet consumed it. Treating
these as one status creates false success, lost results, or duplicate prompts.

| Concern | Authority | Example states |
| --- | --- | --- |
| Execution | Subagent, Terminal, or Workflow producer | `running`, `succeeded`, `failed`, `cancelled`, `timed_out` |
| Exact result | Producing owner/artifact store | `complete`, `partial`, `missing`, `unavailable` |
| Delivery | Completion inbox | `held-for-inline`, `pending`, `delivered`, `consumed-inline`, `rejected`, `uncertain` |
| Model reaction | Parent Pi Session | follow-up turn, next-turn context, user-visible result |
| UI | Dashboard/footer/transcript projection | visible status, retry hint, artifact link |

`execution=succeeded` therefore does not imply `delivery=delivered`, and
`delivery=delivered` does not imply that the parent accepted the result's
conclusions as true.

## 2. Completion envelope

A future shared inbox should carry a small envelope with these logical fields:

```text
schema_version
delivery_id
producer
destination
owner_epoch
terminal_reference
payload_reference or bounded_projection
created_at
attempt
```

### 2.1 Stable delivery ID

`delivery_id` identifies one producer terminal result destined for one parent
owner. It must remain unchanged across batching, retry, process restart, and
replay of a pending delivery.

The ID must not be derived only from a display title or a batch position. A
stable ID lets the inbox de-duplicate pending entries and lets a receiving
Session recognize a rare replay after transport acceptance but before receipt
persistence.

### 2.2 Producer identity

The producer field identifies the execution owner, for example:

```text
kind: subagent | background-terminal | workflow
producer_id: sa-1 | bt-2 | workflow-run-id
terminal_revision: owner-defined
```

The producer identity is not the delivery identity. One producer can have
multiple terminal events over time; one transport batch can contain multiple
producers.

### 2.3 Destination and epoch

The destination names the parent Session or delivery owner that is allowed to
receive the result. The epoch identifies the lifetime of that owner instance.

```text
destination_session_id
destination_owner_kind
owner_epoch
```

A new Session, reload, or replacement parent may have the same human-visible
title but a different epoch. An old completion must not be silently routed to
the new owner merely because a title or process ID looks similar.

When an epoch is no longer active, the inbox should retain the exact result or
artifact according to producer policy and mark delivery as `orphaned`,
`pending-owner`, or `expired`. It should not guess a replacement owner.

### 2.4 Terminal and payload reference

The envelope should point to the producer's exact terminal result or artifact
and may carry a bounded projection for immediate delivery. It must not copy an
unbounded transcript into the inbox.

The reference is owner-scoped and untrusted data. Resolving it requires the
producer/artifact owner to check scope, retention, permissions, and integrity.
The inbox does not become a global artifact router.

## 3. Receipt contract

A delivery receipt is per envelope, not per batch:

```text
delivery_id
attempt
outcome
owner_epoch
recorded_at
error (optional, bounded)
```

Useful outcomes are:

| Outcome | Meaning |
| --- | --- |
| `held-for-inline` | A caller registered interest in receiving the result inline |
| `pending` | Result is retained for a later delivery attempt |
| `accepted` | The destination transport accepted the envelope; persistence of this fact may still be pending |
| `delivered` | The inbox recorded successful delivery to the destination boundary |
| `consumed-inline` | The owning tool call will return the terminal result inline |
| `rejected` | Destination or policy refused the envelope |
| `uncertain` | The process ended before acceptance/receipt could be proven |
| `expired` | Retention or destination policy no longer permits delivery |

The exact vocabulary can be simplified in a first implementation, but
`accepted`, `consumed-inline`, and `uncertain` must not be collapsed into a
generic `done` if recovery depends on the distinction.

## 4. Lifecycle

### 4.1 Register the destination

The parent owner registers its Session identity and current epoch before a
detached producer can publish a completion. The registration is a routing
fact, not permission to mutate the parent.

If the destination is unavailable, the producer may still settle and retain its
artifact. The inbox records a pending or orphaned envelope instead of dropping
the result.

### 4.2 Produce terminal result

The producer settles exactly once for its execution identity. It writes or
references the exact result before claiming that the completion is available.
Producer status remains authoritative; the inbox must not convert a failed
execution into a success merely because a message was sent.

### 4.3 Hold inline interest

For a synchronous `wait`-style operation, the coordinator records inline
interest before the producer can settle. This prevents an automatic delivery
from racing the tool call that promised to return the same result.

The arbitration has two valid winners:

- `consumed-inline`: the waiting operation owns the completion and returns it;
- `pending`/`delivered`: the wait was interrupted, cancelled, or lost the
  arbitration, so the result follows the normal delivery path.

An inline interest that survives a process restart cannot still be assumed to
have an active waiter. Restoration must convert it deterministically to
pending, with an explanatory receipt.

### 4.4 Enqueue pending

When the parent is busy, the inbox stores the envelope by `delivery_id`. The
map/set key makes duplicate enqueue structurally idempotent in one process.
Persistence must be attempted after memory retains the envelope so a disk
failure does not erase the retry owned by the current process.

### 4.5 Flush and wake

The inbox chooses whether to wake the parent based on owner state:

- idle and waiting: a follow-up turn may be appropriate;
- busy: carry a bounded result with the next turn rather than forcing one wake
  per completed producer;
- a batch: wake once, while keeping per-envelope receipts;
- shutdown or owner loss: retain or mark uncertain instead of silently dropping.

The wake decision is delivery policy. It does not change producer terminal
state and does not mean the model has consumed the message.

### 4.6 Acknowledge

The destination boundary returns a per-envelope result. The inbox persists a
`delivered` receipt only after the transport/Session boundary reports success.
If that persistence fails after transport accepted the message, the envelope
must remain recoverable with the same `delivery_id`; a rare duplicate is safer
than silent loss.

### 4.7 Retry

Retry reuses the same `delivery_id`, increments the attempt count, and records
the bounded error. Failed envelopes must not automatically request an
unbounded immediate retry loop. The next retry boundary may be parent settle,
Session restore, explicit user action, or a bounded lifecycle timer owned by
the inbox.

## 5. Owner-specific current behavior

The three current delivery paths already contain pieces of this contract, but
their storage and wake semantics differ.

### 5.1 Direct Subagent

Subagent delivery is a one-shot in-memory map keyed by child ID. It defers a
settled child while the parent is busy and flushes on the idle/parent-settled
edges. An explicit wait can consume the result before automatic delivery. A
delivery exception restores the batch so a later boundary can retry without
loss or reordering.

Its current child ID acts as a local de-duplication key, but it is not by
itself a destination epoch or durable cross-restart delivery ID.

### 5.2 Background Terminal

Background Terminal uses a one-shot pending map keyed by terminal ID. It can
drain bounded batches, restore a drained batch after a failed transport, and
coalesce idle results so a backlog does not force one model turn per process.
The terminal owner separately manages process settlement, output buffers,
spill logs, result interest, and cleanup.

The inbox contract must not make a temporary spill path a durable delivery
identity. The terminal owner decides whether the exact output remains readable.

### 5.3 Workflow

Workflow has the most explicit durable delivery plane today. Its envelope
contains a stable `deliveryId`, `runId`, and terminal details. It persists
`held-for-inline`, `pending`, `delivered`, and `consumed-inline` states, records
attempts and errors, restores pending/held runs after restart, and returns
per-envelope receipts for batched transport.

The Workflow execution status remains authoritative and orthogonal to its
delivery state. This is the model for a shared contract, not a reason to copy
Workflow's complete state machine into the other two extensions.

## 6. Invariants

Any shared inbox must preserve these invariants:

1. Every settled result has either an owner artifact, an explicit unavailable
   outcome, or a recorded persistence failure.
2. One destination/epoch and one terminal result map to one stable
   `delivery_id`.
3. Batching never merges identities or replaces per-item receipts.
4. A transport error restores every unacknowledged envelope.
5. Receipt persistence failure after transport acceptance retains the same
   envelope for at-least-once recovery.
6. A stale epoch is never silently routed to a newer owner.
7. Inline consumption and automatic delivery are resolved by one explicit
   arbitration, not by timing guesses.
8. A failed producer remains failed even when its error message is delivered.
9. A delivered projection never claims that the model consumed the exact
   artifact.
10. A shutdown or interruption produces `uncertain` when completion cannot be
    proven.

## 7. Session changes, fork, and resume

### 7.1 Session replacement

When the parent Session is replaced, its epoch changes. Pending results for the
old epoch may be restored only if the owner explicitly adopts them. Otherwise
they remain pending-owner, orphaned, or expired according to policy.

The inbox must not route by “latest Session with this cwd” or a display name.
Those values are not stable ownership identities.

### 7.2 Fork

A fork creates a new owner identity. It may inspect a producer artifact through
an explicit read-scoped reference, but it does not inherit the right to consume
the original parent's pending delivery. A forked run should receive a new
delivery envelope if it starts a new producer execution.

### 7.3 Resume

On resume, only durable producer records whose delivery state is explicitly
restorable should enter the inbox. An unreadable or malformed record is a
bounded miss/unknown result, not a reason to invent a new completion.

Restoring a `held-for-inline` record after restart must move it to pending
because the original inline waiter is gone. The stable ID is retained so a
receiving Session can recognize a possible duplicate.

## 8. Partial batches and concurrency

A transport batch is an optimization, never the unit of correctness.

```text
batch [A, B, C]
  -> A delivered
  -> B rejected, retained pending
  -> C uncertain, retained with same delivery_id
```

The inbox must not mark the whole batch delivered because one sibling was
accepted. It must not retry the whole batch with fresh IDs because one sibling
failed. Each envelope gets an independent receipt and retry decision.

If a new completion arrives while a flush is in flight, the inbox performs one
additional bounded drain rather than losing the new envelope or starting an
unbounded recursive loop. A retained transport failure does not demand an
immediate retry of itself.

## 9. Trust, projection, and security

Completion text can contain terminal output, commands, secrets, prompt
injection, and untrusted external data. Delivery proves routing/transport, not
truth or safety.

The inbox should:

- keep result projections byte/line bounded;
- preserve a producer-owned exact artifact reference where available;
- mark upstream content as untrusted when it crosses a model boundary;
- avoid putting credentials or arbitrary paths in delivery metadata;
- treat owner/session IDs as opaque, validated identities;
- reject malformed epochs, IDs, and references before routing;
- avoid using a delivery receipt as permission to execute result text;
- keep UI status separate from the artifact's authorization and retention.

The completion inbox must not execute terminal commands, fetch arbitrary URLs,
or mutate files as part of delivery. A later consumer may choose an explicit
action under its own permission contract.

## 10. Failure matrix

| Failure | Correct state | Recovery |
| --- | --- | --- |
| Producer fails before exact result | Producer failure | Deliver bounded error; do not fabricate artifact |
| Parent busy | `pending` | Flush at the next owner boundary |
| Parent idle | `delivered` after receipt | One bounded follow-up wake |
| Inline waiter wins | `consumed-inline` | Do not automatic-deliver the same envelope |
| Inline waiter interrupted | `pending` | Deliver normally |
| Transport rejects one item | `pending` with error | Retry that item with same ID |
| Transport accepts, receipt write fails | `uncertain`/`pending` | Retry or deduplicate using same ID |
| Process crashes during flush | `uncertain` | Restore pending from durable producer record |
| Destination epoch is stale | `pending-owner`/`orphaned` | Explicit adoption or expiry only |
| Exact artifact missing | `partial`/`unavailable` | Preserve honest projection; no fake path |
| Batch partially succeeds | Per-item receipts | Retry only unacknowledged items |
| Session shutdown | Retained or `uncertain` | Restore at the next authorized boundary |

## 11. Minimal future interface

If a second consumer needs a shared helper, start with a pure contract and
owner adapters rather than a global store:

```text
enqueue(envelope): void
holdInline(destination): void
consumeInline(deliveryId): receipt
flush(destination, wakePolicy): receipts[]
restore(ownerEpoch): receipts[]
retryPending(ownerEpoch): receipts[]
```

The helper may validate identity, de-duplicate a batch, and preserve pending
items. It must not resolve every artifact kind, own producer status, decide
filesystem cleanup, or choose a provider/model.

## 12. Minimal OpenPI recommendation

For now:

1. Keep the existing producer state machines and exact artifact stores.
2. Keep the existing shared queue primitives small and owner-neutral.
3. Standardize the vocabulary of delivery ID, destination Session, owner epoch,
   producer identity, terminal reference, attempt, and per-item receipt.
4. Treat Workflow's durable delivery behavior as the reference for restart and
   partial-batch semantics, without copying its full coordinator.
5. Add a shared inbox only after a concrete second durable consumer needs the
   same serialization and receipts.
6. Use at-least-once plus stable IDs; do not promise distributed exactly-once.

## 13. Non-goals

- Merging Subagent, Background Terminal, and Workflow execution state machines.
- Replacing producer-owned terminal status or exact artifact persistence.
- Introducing a process-global task store or resource router.
- Claiming that transport acceptance equals model consumption.
- Claiming distributed exactly-once delivery without an atomic receiver.
- Routing old completions to a new Session by cwd, title, or process ID.
- Making delivery text trusted instructions or executable actions.
- Adding a new wake per completed producer in a busy parent Session.

## Sources

Current shared and owner-specific delivery implementations:

- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/shared/result-delivery.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/subagents/src/result-delivery.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/background-terminals/src/result-delivery.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/workflows/result-delivery.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/workflows/artifacts.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/docs/design/OPENPI_WORKFLOW_V2_DESIGN_2026-08-23.md

Issue and contribution context:

- https://github.com/tt-a1i/openpi/issues/160
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/CONTRIBUTING.md