# Exploration Checkpoint and Rewind Contract

Status: research contract. This document defines the boundary between a
recyclable exploration checkpoint, rewind, Pi session history, and OpenPI's
`context_pivot` capability.

This document does not add a checkpoint manager, restore files, mutate Git
refs, or promise rollback of provider state or external side effects.

## Decision

An exploration checkpoint is a durable, named recovery marker for a phase of
work. It records enough exact identity and artifact evidence to resume from a
known point without pretending that all hidden runtime state can be restored.

Rewind does not erase history or move a mutable pointer backwards. It creates
a new active branch from a checkpoint and records that transition. The
original branch remains available for comparison and audit.

`context_pivot` is different: it deliberately changes the active model-visible
context in the same Pi session by asking Pi to compact the old phase around a
self-contained brief. It is context management, not exploration rollback.

The immediate OpenPI recommendation is documentation-only. Any future runtime
implementation must first settle the persistence, worktree, artifact, and
permission contracts below.

## 1. Terms

### 1.1 Exploration

Exploration is work whose next direction may change: research, planning,
diagnosis, design comparison, or a proposed implementation path. It can be
useful to preserve several candidate paths without claiming that selecting a
different path undoes effects already produced.

### 1.2 Checkpoint

A checkpoint is an append-only record containing a stable identifier, a
session/history position, a parent checkpoint when applicable, and references
to the exact artifacts needed for recovery. It is a recovery boundary, not a
complete snapshot of a process, provider, filesystem, or world state.

### 1.3 Rewind

Rewind selects an existing checkpoint as the base for a new active branch. It
must preserve the prior branch and make the new branch relationship visible.
The term must not imply that network requests, subprocesses, provider KV
state, or external mutations have been undone.

### 1.4 Context pivot

`context_pivot` is an OpenPI tool that asks Pi to replace a long active context
with a concise next-phase brief. Pi remains the owner of Session compaction,
history persistence, branch reconstruction, and compaction lifecycle events.

### 1.5 Artifact

An artifact is exact durable evidence outside the active model context: a
file, patch, report, test result, receipt, or other bounded reference. A
checkpoint may point to an artifact; a summary must not be treated as the
artifact itself.

## 2. Why checkpoint and context pivot are not interchangeable

| Question | Exploration checkpoint | Rewind | `context_pivot` |
| --- | --- | --- | --- |
| Primary purpose | Preserve a recovery boundary | Continue from an earlier boundary | Make a long active context usable |
| Exact history | Referenced, not deleted | Original branch retained | Pi history remains the source of truth |
| Active branch | Does not change it | Creates a new child branch | Stays in the same Session lifecycle |
| Model-visible prompt | No automatic injection required | May load a bounded recovery brief | Deliberately changes through Pi compaction |
| Filesystem | Receipt or reference only by default | Restore requires separate explicit policy | Not a filesystem operation |
| Provider hidden state | Not captured as a general promise | Not restored | Owned by Pi/provider integration |
| External side effects | Never implicitly reversed | Never implicitly reversed | Unrelated to rollback |
| Safe default | Record metadata and evidence | Preview the new branch | Use Pi's existing compaction contract |

The distinction prevents two common false promises:

1. A shorter context is not proof that an earlier exploration state can be
   restored.
2. A checkpoint identifier is not proof that an API call, terminal process,
   file upload, or remote mutation can be undone.

## 3. Ownership boundaries

| State or action | Correct owner | Checkpoint contract |
| --- | --- | --- |
| Session entries, history tree, compaction, branch reconstruction | Pi | Store a session/head reference; do not duplicate the Session store |
| Checkpoint metadata and exploration relationship | A future OpenPI exploration layer | Append records and preserve ancestry |
| Prompt/KV cache, reasoning items, opaque provider state | Provider/Pi adapter | Record only observable receipts; never copy hidden keys |
| Git refs and committed content | Git | Record a ref/commit identity; do not silently rewrite it |
| Dirty, untracked, or ignored worktree files | User/worktree policy | Produce a receipt; require explicit consent before restoration |
| OpenPI-owned artifacts | The artifact-producing feature | Keep exact content and retention evidence separate |
| Network, database, cloud, and other external effects | External system | Record evidence only; no generic rollback claim |

The owner that can create a checkpoint is not automatically the owner that
can restore every state named by that checkpoint. A checkpoint is valid only
to the extent that each referenced owner can verify its part of the receipt.

## 4. Checkpoint contents

A minimal future checkpoint record should contain:

```text
schema_version
checkpoint_id
parent_checkpoint_id (optional)
session_id
session_head_id
branch_id or branch ancestry reference
created_at
reason
goal_or_phase_reference (optional)
artifact_references[]
worktree_receipt (optional)
status
```

The `worktree_receipt` should describe what was observed, not silently imply
that the working tree can be restored. If included, it may contain:

- repository and worktree identity;
- current branch and commit;
- tracked diff identity and a bounded stat;
- untracked and ignored path inventory where policy permits;
- whether the observation was complete, partial, or uncertain.

The record should not contain or promise:

- provider cache keys or opaque reasoning state;
- credentials, access tokens, or arbitrary secret-bearing tool output;
- live process handles, sockets, locks, or timers;
- an unbounded copy of the active conversation;
- a claim that an external side effect is reversible.

Large exact material belongs in a protected artifact. The checkpoint stores an
identity, retention information, and a recovery reference rather than another
copy of the payload.

## 5. Lifecycle

### 5.1 Create

Checkpoint creation is an explicit boundary. The producer records the current
Session head and all available owner receipts before declaring the checkpoint
usable. If a receipt cannot be obtained, the result is `partial` or
`uncertain`, not a silently stronger checkpoint.

Creation should be idempotent for a caller-supplied checkpoint key. A retry
must either return the same record or create a clearly distinct record; it
must not produce two records that appear to have the same identity.

### 5.2 Continue

Normal work continues from the active branch. A checkpoint does not inject
its contents into every following prompt, does not freeze the worktree, and
does not reserve provider cache state.

### 5.3 Rewind

A safe rewind sequence is:

1. Resolve the checkpoint and verify its ancestry and retention status.
2. Re-check the referenced artifacts and worktree receipt.
3. Show the user what can be recovered and what cannot.
4. Create a new branch or branch marker from the checkpoint's Session head.
5. Record `rewind_requested` and `rewind_applied` (or a failure/uncertain
   outcome) in append-only history.
6. Continue only on the new branch; retain the old branch for comparison.

Rewind must fail closed when the checkpoint is missing, malformed, expired,
ambiguous, or inconsistent with the current owner receipts. It must not
silently substitute the nearest checkpoint.

### 5.4 Retain and expire

Retention is separate from rewind. Expiring a checkpoint removes or disables
its recovery guarantee; it does not rewrite Session history or delete a Git
branch by implication. A record whose exact artifacts have expired should
remain visible as `expired` or `degraded` evidence when policy allows.

## 6. Branch and history semantics

The original exploration path is valuable evidence. Rewind therefore uses
branching semantics:

```text
checkpoint A ---- B ---- C       original path retained
        \
         rewind(A) ---- D         new active exploration path
```

The new path may share ancestry with the old path, but its subsequent Session
entries, artifacts, and decisions must be distinguishable. A display label
such as `rewind(A)` is not sufficient as a globally unique identity; records
need stable identifiers and parent references.

A checkpoint does not change the meaning of Pi's existing `/tree` or Session
branch navigation. If a future feature integrates with those primitives, it
must use their persistence and reconstruction contracts rather than inventing
a second history tree.

## 7. Worktree and side-effect safety

Metadata-only rewind is the safe default. Restoring files is a separate,
explicit operation with a preview and a user-approved policy.

Any worktree-aware implementation must:

- preserve unrelated local changes;
- inspect tracked, untracked, and ignored files before acting;
- show the exact intended patch or restoration set;
- refuse ambiguous paths and unresolved state;
- avoid force reset, broad clean, or destructive deletion by default;
- leave a receipt describing what was applied and what was skipped;
- keep an `uncertain` result when a process is interrupted during restoration.

Even a perfect worktree restore cannot undo a test that uploaded data, a
message sent to a provider, a database write, or a process that already
changed external state. The UI and API must say “restore worktree evidence”
when that is all the feature can do, not “undo the task”.

## 8. Context, compaction, and memory

Checkpoint metadata should not be appended to every model request. That would
increase context size and make prompt prefixes less stable. A recovery flow
may inject a bounded brief containing the selected checkpoint ID, current
goal, verified artifacts, and unresolved limitations.

`context_pivot` may be useful after a rewind or before changing exploration
phase, but it does not replace the checkpoint. The recommended sequence is:

```text
record exact evidence -> select/rewind branch -> load bounded brief if needed
-> use Pi-native compaction only when the active context needs it
```

Durable memory and artifacts are also separate. A memory entry can help a
future run find a checkpoint, but it is not an authoritative checkpoint unless
it contains a verifiable reference to the owning record.

Prompt-cache observations are evidence about a request, not evidence that a
checkpoint can be restored. Branch changes, summary insertion, tool changes,
model changes, and provider policy can all alter cache identity.

## 9. Evidence and failure states

Every operation should distinguish at least:

| State | Meaning |
| --- | --- |
| `complete` | All required owner receipts were verified |
| `partial` | The record is usable only for the verified portions |
| `uncertain` | The operation may have happened, but completion was not proven |
| `expired` | Retention policy no longer promises recovery |
| `rejected` | Validation or permission policy prevented the operation |
| `failed` | The operation completed with a known error and no applied result |

An interrupted rewind must not be reported as successful merely because a
branch marker was written. The final state needs to say whether the new active
branch was selected, whether artifacts were loaded, and whether any worktree
operation was applied.

## 10. Verification matrix for a future implementation

| Scenario | Required proof |
| --- | --- |
| Create and retry the same checkpoint | Stable idempotent identity |
| Rewind with no file changes | New branch, old branch retained |
| Rewind with dirty tracked files | Preview and explicit policy; no silent loss |
| Rewind with untracked/ignored files | Inventory and fail-closed ambiguity handling |
| Missing artifact | `partial`, `expired`, or `rejected`; no false recovery claim |
| Compaction after checkpoint | Session owner remains Pi; checkpoint reference remains valid |
| Session reload or process restart | Append-only records reconstruct consistently |
| Branch divergence | Parent/child identities remain distinct |
| Provider/model switch | Hidden provider state is not claimed to be restored |
| Interrupted operation | `uncertain` receipt and safe continuation path |
| External side effect already performed | Evidence is retained; no generic undo claim |
| Child session or workflow | Ownership and artifact references do not leak across boundaries |

The smallest useful test suite should exercise the identity and failure
contracts before attempting any filesystem restoration. A restoration feature
without these tests would be a more dangerous version of a history pointer,
not a reliable checkpoint system.

## 11. Minimal OpenPI recommendation

For now:

1. Keep this as a design contract; do not add runtime checkpoint state.
2. Keep Pi as the owner of Session history, compaction, and branch recovery.
3. Keep OpenPI-owned artifacts exact and separately retained.
4. Treat worktree restoration as an explicit future capability with its own
   permission and preview contract.
5. Use `context_pivot` for phase changes and context pressure, never as a
   synonym for rewind.

If implementation is later justified by a concrete user workflow, start with
append-only checkpoint metadata and branch markers. Add filesystem restoration
only after the receipts, permissions, interruption handling, and tests above
are accepted. Do not introduce a global rollback manager as a prerequisite for
ordinary Session or workflow execution.

## 12. Non-goals

- Replacing Pi's Session store or compaction lifecycle.
- Copying or decoding provider prompt caches or hidden reasoning state.
- Providing transactional undo for network or external system effects.
- Silently resetting a Git worktree or deleting untracked files.
- Treating a summary, memory item, or PR description as exact recovery data.
- Adding a second OpenPI-wide branch graph before a concrete use case exists.

## 13. Known unknowns

- The exact provider state that survives a Session branch or model change is
  provider-specific and should not be inferred from latency or cache counters.
- The durable artifact and worktree policies needed by a real rewind feature
  depend on the user-facing workflow and permission model.
- Whether a future Pi primitive should expose a first-class exploration marker
  is an upstream design question; this document does not prescribe an API.
- A checkpoint can improve recovery ergonomics without making the underlying
  work reversible. Quality should be measured by evidence and safe recovery,
  not by how much state a feature claims to restore.

## Sources

OpenPI's current context-pivot ownership and threshold:

- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/context-pivot/index.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/README.md

OpenPI's current Session projection and compaction boundaries:

- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/sessions/preview-loader.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/docs/design/TASKS_EVALUATION.md

Contribution and branch safety guidance:

- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/CONTRIBUTING.md
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/docs/contributing/linear-git-history.md