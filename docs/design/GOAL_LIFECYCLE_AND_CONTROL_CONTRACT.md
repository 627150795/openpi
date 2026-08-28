# Goal Lifecycle and Control Contract

Status: documentation contract. This document records the current OpenPI Goal
lifecycle, control authority, persistence, continuation, and accounting
boundaries. It does not add a second Goal store, an App Server, or new model
controls.

## Decision

OpenPI keeps one Session Goal implementation owned by the Pi Session:

- Pi Session history is the durable source of truth.
- OpenPI owns the Goal controller, commands, model-tool seam, and package UI.
- The user or host owns objective changes, pause, resume, clear, and replacement.
- The model may read the Goal, create one only after an explicit request, and
  report complete or a genuine blocker.
- Runtime code owns validation, persistence, accounting, continuation dispatch,
  and lifecycle safety.
- Files, Git, tests, artifacts, external systems, and user confirmation remain
  evidence for whether an objective is actually complete.

The contract intentionally does not copy the Codex App Server or SQLite Goal
table into OpenPI.

## 1. Vocabulary

### Goal

A durable objective that can continue across multiple Agent turns. A Goal
states what must become true; it is not proof that the state is already true.

### Edit objective

Change the text of the existing Goal while preserving its identity and
accumulated usage. OpenPI exposes this as the interactive command
"/goal edit".

### Replace Goal

End the current Goal and create a new one with a new identity and fresh
accounting. The interactive "/goal <new objective>" path asks for confirmation
when an unfinished Goal exists.

### Pause

Keep the Goal and accounting, but stop autonomous continuation. Only a user
command or equivalent host control should resume it.

### Clear

Abandon the current Goal without claiming success. OpenPI persists a cleared
tombstone in Session history, so clear is not physical deletion from the Pi
history.

### Complete

Claim that every requirement of the objective is satisfied. The model must
perform an evidence audit before using this state. A completion acknowledgement
used by the UI is separate from completion evidence.

### Blocked

Claim that no meaningful work can continue until a blocker or external state
changes. Difficulty, uncertainty, an unfinished turn, or a desire for
clarification is not enough.

### Thread stop

Stop the live runtime. This is not automatically pause, clear, complete, or
blocked for the durable Goal.

## 2. Status model

OpenPI stores the following status values in a versioned Goal snapshot:

| Status | Meaning | Can resume? |
| --- | --- | --- |
| active | Eligible for work and autonomous continuation | n/a |
| paused | User or lifecycle interruption stopped continuation | yes |
| blocked | A genuine blocker or safety/error path stopped work | yes |
| usage_limited | The active turn ended after a provider usage limit | yes |
| budget_limited | The local token budget was reached; a wrap-up turn may run | no direct continuation |
| complete | The model reported completion after its audit | no |
| cleared | User abandoned the Goal; retained only as a tombstone | no |

budget_limited and usage_limited are different. The first is a local
accounting threshold. The second records an observed provider usage-limit
failure after the budget-limited path.

The status list is a storage vocabulary, not a promise that every arbitrary
status transition is a valid user action. The controller provides the
user-facing transition checks and the model-tool audit.

## 3. Control authority

| Operation | Actor | Current effect |
| --- | --- | --- |
| get_goal | Model | Read the current public snapshot and remaining budget |
| create_goal | Model, after explicit user/system request | Create an active Goal only when no unfinished Goal exists |
| /goal <objective> | User | Create a Goal, or confirm clear-then-create replacement |
| /goal edit | User | Edit the current objective in place |
| /goal pause | User | Flush progress and pause an active Goal |
| /goal resume | User | Resume a resumable Goal and reset the continuation breaker |
| /goal clear | User | Append a cleared snapshot; this does not mean complete |
| update_goal(complete) | Model | Mark completion after evidence audit |
| update_goal(blocked) | Model | Record a blocker; accept it only after the blocked audit |
| Session lifecycle | Runtime/Pi | Restore, defer, dispatch, account, and shut down Goal work |

The model does not receive unrestricted pause, resume, clear, or replace tools.
This keeps user/host authority separate from model-reported outcomes.

### 3.1 Identity and replacement

A new Goal snapshot receives a new URL-safe id, starts with zero token and
time usage, and begins at a new revision. Editing an objective keeps the same
id, createdAt, token usage, elapsed time, and optional budget.

The interactive replacement path is intentionally explicit:

~~~text
unfinished Goal
  -> ask the user to confirm replacement
  -> append cleared snapshot for the old Goal
  -> create a new active Goal with a new id
~~~

A model create_goal call is rejected while an unfinished Goal exists. A
completed or cleared Goal does not silently become the new objective; the
normal creation path creates a fresh identity.

### 3.2 Accounting

The snapshot records:

- tokensUsed;
- timeUsedSeconds;
- optional positive tokenBudget;
- continuationCount.

Goal token usage is derived from assistant message usage: the controller prefers
the message input plus output counts and falls back to totalTokens when
available. This is a local assistant-usage measure, not a normalized
cross-provider billing number. Cached-input, reasoning-token, retry, and
provider-fallback accounting must not be inferred from this snapshot alone.

When tokensUsed reaches tokenBudget, the Goal enters budget_limited and
may receive one bounded wrap-up prompt. A provider usage-limit error can then
move it to usage_limited. Editing keeps usage and budget; it does not reset
the accounting clock.

## 4. Transition contract

The following are the observed, supported paths:

~~~text
create                     -> active
active                     -> paused          user, interruption, dispatch failure
active                     -> blocked         accepted blocker, error, safety limit
active                     -> budget_limited  local token threshold
budget_limited             -> usage_limited   provider usage-limit error
active                     -> complete        model completion audit
paused                     -> active          explicit user resume
blocked                    -> active          explicit user resume
usage_limited              -> active          explicit user resume
any visible Goal           -> cleared         explicit user clear
~~~

A plain state transition helper validates snapshot shape and timestamps but does
not enforce a universal finite-state table. This is deliberate: host/user
control may need to correct a state, while model tools have narrower authority.
Future host APIs must document whether an invalid transition is rejected,
ignored, or treated as a correction.

### 4.1 Pause and resume

Pause flushes tracked progress, appends a paused snapshot, stops pending
continuation, and resets the accounting clock. It is only available from
active.

Resume is explicit user action. It is available from paused, blocked, or
usage_limited, returns the Goal to active, clears deferred continuation
state, and resets continuationCount. Resetting the count is the recovery path
from the emergency continuation breaker.

### 4.2 Completion

update_goal(complete) is model-only. The prompt requires a
requirement-by-requirement audit against current files, commands, tests, Git,
artifacts, external state, or user confirmation as appropriate. A plan,
status line, previous answer, or absence of an obvious error is not enough.

After completion, the next explicit user input may carry a private marker so
the controller can persist completionAcknowledged. The marker is removed
before normal message processing. It proves only that the UI lifecycle was
acknowledged; it does not prove the objective.

### 4.3 Blocked audit

update_goal(blocked) requires a non-empty blocker description. The controller:

1. records the normalized blocker on the current Goal turn;
2. keeps the Goal active for the first two matching reports;
3. accepts blocked after the same blocker recurs on three distinct
   consecutive Goal turns;
4. clears the audit when a Goal turn makes progress without reporting that
   blocker;
5. resets the audit when the user explicitly resumes the Goal.

The current comparison is normalized text equality, not semantic equivalence.
System error and internal safety-limit paths can enter blocked without this
model-report audit. A future semantic blocker classifier should not be added
without evidence that exact text is insufficient.

## 5. Continuation and lifecycle

### 5.1 Normal continuation

For an active Goal, a settled successful turn may dispatch a visible
goal-continuation message. The controller:

- prevents concurrent duplicate dispatch with an in-memory pending flag;
- checks idle state unless a user edit or budget wrap-up allows a busy dispatch;
- sends the follow-up first;
- increments continuationCount only after the send succeeds;
- pauses the Goal if the follow-up cannot be dispatched.

The send and the later appendEntry are separate operations. A crash or append
failure after the follow-up can therefore leave a dispatched turn without a
complete continuation receipt. The implementation must not claim exactly-once
dispatch from the snapshot alone.

### 5.2 Budget wrap-up and safety limit

Reaching a token budget stops ordinary continuation and sends a bounded wrap-up
prompt through the budget_limited path. The prompt asks for a concise report
of useful progress, remaining work, and blockers; it is not permission to
start unrelated work.

An internal continuation limit moves an active Goal to blocked. This is a
safety stop, not evidence that the objective is complete. "/goal resume"
explicitly resets the continuation count before trying again.

### 5.3 Fork, tree, reload, print, and JSON

| Situation | Restoration and continuation behavior |
| --- | --- |
| Normal interactive Session start | Restore the latest snapshot; an active non-deferred Goal may continue |
| Fork Session start | Restore the branch but defer active continuation to avoid an automatic child dispatch |
| Session tree/branch change | Restore the selected branch and defer active continuation |
| Explicit user input after defer | Clear the defer marker; normal Goal work may continue |
| TUI with paused/blocked/usage-limited Goal | Ask whether the user wants to resume |
| Print or JSON mode | Restore state for reporting, but disable autonomous Goal automation |
| Session shutdown | Stop runtime tracking; do not treat shutdown as completion |

The deferred flag avoids a child or branch immediately sending work before its
state is visibly selected. It is a lifecycle guard, not a second Goal state.

## 6. Persistence and recovery

Each durable mutation is appended to Pi Session history as a session-goal
custom entry. A snapshot includes version, revision, identity, objective,
status, usage, timestamps, and optional lifecycle fields.

Restore behavior is:

1. collect Goal entries from the selected Session branch;
2. rank valid entries by revision and later position;
3. migrate supported version-1 snapshots to version 2;
4. hide a winning cleared snapshot from the public Goal view;
5. lock restoration when a later malformed entry would make the result
   ambiguous, rather than guessing an older state.

The revision is an append-only ordering and recovery field. It is not an
external compare-and-set token. The current controller assumes one parent
Session owns mutations; it is not a multi-client concurrency protocol.

## 7. Codex comparison

The fixed Codex research baseline exposes an App Server Goal control plane
alongside its Thread runtime. OpenPI and Codex should not be described as
sharing the same storage or authority model.

| Boundary | OpenPI | Codex baseline |
| --- | --- | --- |
| Durable source | Pi Session session-goal entries | App Server SQLite Goal row per Thread |
| User/host control | Slash commands in the parent Session | thread/goal/set, get, and clear |
| Model control | get_goal, explicit create_goal, audited update_goal | Model reports completion or blocked; host owns pause/clear |
| Edit | /goal edit keeps identity and usage | Goal set with an objective updates an existing row in place |
| Replace | Confirmed clear followed by new Goal | Separate host action must express replacement semantics |
| Clear | Append tombstone; history remains | Delete durable row and emit clear event |
| Accounting | Assistant usage and local elapsed time | Goal-specific token and wall-clock accounting |
| Concurrency guard | No external actor CAS today | Per-thread locks and internal expected-id checks |

In Codex, thread/goal/set(objective="new") is normally an in-place edit when
a Goal already exists; it is not automatically a reset. thread/goal/clear is
destructive to the current durable row, while OpenPI's append-only tombstone
preserves Session history.

The Codex comparison is evidence for ownership boundaries, not a request to
copy its App Server or database into OpenPI.

## 8. Future host controls

A future Web, SDK, or multi-client host may need typed Goal controls. If that
happens, the minimum safe seam is:

~~~text
get
edit
pause
resume
clear
replace-with-confirmation
~~~

Such a seam must:

- reuse the existing Goal controller and Session persistence;
- require expected Goal id and revision for mutation;
- flush accounting before a mutation;
- return the persisted snapshot, not only an in-memory value;
- emit distinct updated and cleared lifecycle events;
- keep replacement and clear out of ordinary model tools.

Until a real external host exists, adding a second API or database is
unnecessary.

## 9. Evidence and non-goals

The following distinctions are part of the contract:

- Goal status is a runtime claim, not proof of external task state.
- complete is not implied by budget_limited, paused, clear, or the end
  of a model turn.
- blocked is resumable and does not mean the objective was abandoned.
- completionAcknowledged is a UI/session lifecycle flag, not completion
  evidence.
- A Goal snapshot cannot prove the exact provider payload, model attention,
  provider-internal routing, or semantic success.
- A normal thread stop cannot be presented as a Goal mutation.
- Prompt anti-loop guidance should be measured by reduced no-progress turns and
  improved evidence, not by prompt length.

Non-goals:

- No OpenPI SQLite Goal table.
- No unrestricted model-side pause, clear, resume, or replacement tools.
- No OpenPI token estimator that claims provider-independent billing accuracy.
- No generic multi-client CAS implementation before a multi-client host exists.
- No automatic Goal creation inferred from ordinary tasks.
- No semantic blocker classifier without a reproducible need.
- No copying of Codex App Server lifecycle or continuation storage.

## 10. Source map

OpenPI implementation:

- [Goal command and model-tool surface](../../extensions/goal/index.ts)
- [Goal controller and continuation lifecycle](../../extensions/goal/controller.ts)
- [Snapshot validation and recovery](../../extensions/goal/state.ts)
- [Continuation and completion prompts](../../extensions/goal/prompts.ts)
- [Goal UI and status labels](../../extensions/goal/ui.ts)

Codex fixed research baseline:

- [Goal API](https://github.com/openai/codex/blob/a9e447a69dee4f2789dd8d8c776e314772c1f049/codex-rs/ext/goal/src/api.rs)
- [Goal runtime](https://github.com/openai/codex/blob/a9e447a69dee4f2789dd8d8c776e314772c1f049/codex-rs/ext/goal/src/runtime.rs)
- [Goal accounting](https://github.com/openai/codex/blob/a9e447a69dee4f2789dd8d8c776e314772c1f049/codex-rs/ext/goal/src/accounting.rs)
- [Goal state runtime](https://github.com/openai/codex/blob/a9e447a69dee4f2789dd8d8c776e314772c1f049/codex-rs/state/src/runtime/goals.rs)
- [Thread Goal protocol](https://github.com/openai/codex/blob/a9e447a69dee4f2789dd8d8c776e314772c1f049/codex-rs/app-server-protocol/src/protocol/v2/thread.rs)

This document records current behavior and evidence limits. Runtime changes
must update the contract and its targeted tests together.
