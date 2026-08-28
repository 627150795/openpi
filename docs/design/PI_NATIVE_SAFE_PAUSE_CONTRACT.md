# Pi-native safe-pause contract

Status: proposed research/design for [Issue #161](https://github.com/tt-a1i/openpi/issues/161). This document does not add a pause implementation.

## Problem

OpenPI currently exposes separate cancellation controls for Subagents,
Workflows, and Background Terminals. Those controls can stop selected work,
but they cannot prove that the main Agent and all in-process child execution
paths will stop before their next provider or tool action.

Pause is a different operator action from cancel: it should stop new work at a
safe boundary while allowing work already in flight to settle.

## Decision

The global pause gate must live at a Pi agent-loop seam that owns provider and
tool dispatch. OpenPI extensions must not install separate flags and claim to
provide an atomic global pause. If Pi does not expose the required seam, the
implementation should record an upstream requirement and keep the current
per-owner cancel/stop controls.

The first version is an operator control primitive, not a model decision and
not a new task/workflow state.

## State and receipt

The pause state is scoped to a Session tree or other explicit Pi-owned scope;
it must never be inferred from a single child status:

```text
running
   -> pause-requested
   -> partially-parked
   -> fully-parked
   -> resuming
   -> running
```

- `pause-requested`: the operator request was accepted; existing provider and
  tool calls may still be running.
- `partially-parked`: some eligible loops reached a safe boundary, while one
  or more remain in flight or have an uncertain state.
- `fully-parked`: every eligible Pi-owned loop has acknowledged the gate at a
  safe boundary. This does not mean external processes are frozen.
- `resuming`: an explicit operator resume was accepted; new work is not
  considered running until the gate is open.

Every state change should expose a bounded receipt containing a scope,
generation, requested time, observed time, and per-owner status. A timeout or
disconnect must report `uncertain`, not `fully-parked`.

Pause state does not rewrite Task, Goal, Workflow, success, failure, cancel,
or completion status.

## Safe boundaries

The Pi-owned gate must be checked before:

- starting a new provider request;
- executing a new tool call;
- admitting a child spawn or Workflow step;
- starting a completion-triggered follow-up turn.

An already-started provider stream or mutating tool is allowed to finish unless
the operator separately requests cancellation. The pause operation must not
pretend that an interrupted write is settled.

Normal user/model work is held while paused. Control operations remain
available so the operator can inspect status, resume, cancel a target, or shut
down. A new user message must be explicitly defined as queued, rejected, or a
resume request; it must not implicitly resume the session.

## Scope ownership

| Execution path | Pause requirement | Evidence boundary |
| --- | --- | --- |
| Main Pi Agent | Must park before its next provider/tool action | Pi agent-loop gate |
| In-process Subagent | Must share the Pi-owned gate or report unsupported | Child loop acknowledgment |
| Workflow child | Must not start a new provider/tool action after the gate | Child session/generation receipt |
| Completion-triggered wake | Must be held before creating another turn | Delivery/admission receipt |
| Background Terminal | Is an external process; pause does not freeze it | Separate running/paused/unknown status |

Background Terminal output may continue while the Pi Agent is parked. The UI
must show that as independent external activity rather than claiming the whole
Session is paused. A future terminal-specific freeze or kill policy is a
separate contract.

## Pause versus cancel

| Operation | In-flight work | New work | Terminal outcome |
| --- | --- | --- | --- |
| Pause | Continues to a safe settlement boundary | Held by the gate | Reversible parked state |
| Cancel | Target receives cancellation and may settle uncertainly | Target does not continue | Cancelled/uncertain receipt |
| Stop/kill | Owner-specific termination policy | Owner-specific | Stopped/terminated/uncertain |

No pause receipt may be used as evidence that a cancelled tool succeeded, and
no cancel receipt may be used as evidence that all other owners are parked.

## Lifecycle edge cases

- A second pause request is idempotent for the same scope and generation.
- Resume is explicit and does not start a new model turn by itself.
- A newly spawned child cannot bypass an active gate; admission is held or
  rejected according to the Pi seam contract.
- Session switch creates a new scope or transfers a clearly identified gate;
  it must not leak a paused flag into an unrelated session.
- Shutdown releases waiters and prevents new work; it must not use cleanup as
  a reason to start work.
- RPC/ACP disconnect reports the last known receipt and applies the selected
  owner-lost policy. It must not claim fully parked without acknowledgments.

## Implementation gate

Before adding a runtime surface, verify a Pi-native seam for:

1. main-agent provider dispatch;
2. tool dispatch;
3. in-process child loops;
4. child spawn/admission and completion-triggered turns;
5. status, resume, cancellation, shutdown, and disconnect cleanup.

The minimum test matrix must cover an idle session, each in-flight boundary,
multiple children, a child spawn racing with pause, a mutating tool, cancel
while paused, resume, session switch, shutdown, and an external Background
Terminal. Tests must distinguish requested, partially parked, fully parked,
and uncertain receipts.

If any required path lacks a Pi seam, stop at the design and upstream-request
stage. An extension-level approximation is worse than a clearly unsupported
feature because it gives the operator a false safety guarantee.

## Non-goals

- Replacing cancel, interrupt, stop, or kill.
- Freezing OS threads or external processes.
- Monkey-patching Pi internals from an extension.
- Allowing the model to trigger a global pause automatically.
- Changing canonical Task, Goal, Workflow, or completion semantics.
- Claiming instantaneous quiescence when work is still in flight.