# Local Read-Only Observer Contract

Status: research-only first pass for [issue #166](https://github.com/tt-a1i/openpi/issues/166). This contract is a possible local precursor to OpenPI Web #76. It does not add a Web server, relay, remote controller, network transport, or write capability.

## Goal and boundary

An Observer can inspect a running Pi Session and its OpenPI-owned projections without becoming a second Session owner. Pi remains the sole execution authority and the existing session/transcript remains the source of truth.

The first useful version is local and read-only:

- same host and explicitly selected Session only;
- no network listener, relay, browser transport, prompt, interrupt, steer, kill, or file mutation;
- no implicit sharing of secrets, raw tool payloads, or complete transcripts;
- no observer state persisted as a second copy of the Session.

This is deliberately narrower than OMP Live Session Sharing and does not expand the first phase of #76.

## Identity

Every observation request binds to a validated `SessionIdentity`:

```text
session_id       Pi session identity
session_path     canonical session file path
workspace_root   canonical project/worktree root
observer_id      local ephemeral reader identity
```

The reader must resolve the selected session through Pi's existing `SessionManager` APIs. A model-provided path, display name, or session title is not sufficient identity. The workspace root and session path must be checked before reading, and a worktree must not be silently treated as its parent repository.

## Snapshot and event cursor

An Observer reads an initial bounded snapshot and then requests changes after a cursor:

```ts
type ObserverSnapshot = {
  session: SessionIdentity;
  epoch: number;
  cursor: number;
  status: "idle" | "running" | "waiting" | "closed";
  title?: string;
  branchHead?: string;
  visibleAgents: ReadonlyArray<AgentSummary>;
  visibleEntries: ReadonlyArray<EntrySummary>;
  partial: boolean;
};

type ObserverEvent = {
  epoch: number;
  sequence: number;
  kind: "snapshot" | "entry" | "state" | "agent" | "notice" | "closed";
  data: unknown;
};
```

The exact TypeScript types are future work. The invariants are not:

- `epoch` changes when the observed source is replaced, reset, or no longer comparable;
- `sequence` is monotonic within an epoch;
- a cursor is opaque and must not be guessed or incremented by the reader;
- events after a stale cursor require a fresh snapshot before they are applied;
- duplicate events are harmless and must not create duplicate visible entries;
- missing or malformed events cause a resync, not a guessed state.

If no stable event source exists yet, expose snapshots only and report `event_stream: unavailable`. Do not simulate an event cursor from wall-clock timestamps.

## Visible data

The Observer projection may include bounded, redacted summaries:

- session status, title, workspace label, and current epoch/cursor;
- assistant text deltas or final text within a byte budget;
- tool name, start/end state, and bounded safe output preview;
- Subagent id, title, status, and bounded latest result projection;
- Workflow status, phase, artifact references, and acceptance summary when already public to the parent.

By default it must exclude:

- provider credentials, environment variables, authentication headers, and tokens;
- raw JSON-RPC or tool payloads;
- arbitrary file contents and complete unbounded transcripts;
- internal model prompts or hidden system instructions;
- unverified paths, URLs, or model-authored claims of completion.

Redaction is a projection rule, not a guarantee that a secret can never appear in model output. The observer should expose `partial` and `redactions` metadata when content was removed or bounded.

## Read-only authority

The first observer has no command channel. There is no observer equivalent of `prompt`, `interrupt`, `steer`, `subagent_cancel`, `workflow_stop`, or `bg_kill`.

Later controller work must be a separate capability with a separate contract for actor identity, authorization, lease ownership, expected epoch, replay protection, and receipts. Adding a command to the read-only observer would make a supposedly harmless viewer an execution authority.

## Lifecycle

```text
requested → resolving → observing → resync_required → closed
```

- Starting an Observer does not start or modify the target Session.
- A reader closes when the target Session closes, the workspace identity changes, or its owner explicitly disposes it.
- Session shutdown ends all local observer streams and releases subscriptions.
- Observer failure is isolated from the Session and must not cancel or pause primary work.
- Reopening after a close creates a new observer identity and starts with a fresh snapshot.

## Backpressure and budgets

The source of truth may produce events faster than a reader can render them. The contract must therefore bound:

- snapshot bytes and entry count;
- per-event bytes;
- queued events per observer;
- total observer memory and render time;
- maximum resync frequency.

When a queue exceeds its budget, coalesce replaceable state updates, retain a `resync_required` notice, and discard old previews. Never drop a cursor gap silently. The Observer is allowed to become stale; it is not allowed to claim a contiguous view it did not receive.

## Local security and trust

- No listening socket or relay is part of this contract.
- Access is limited to the local process and an explicitly selected Session.
- Project trust may control whether project-provided display metadata is loaded, but trust is not a license to expose credentials or raw transcript data.
- Session and artifact paths are canonicalized and checked before reads.
- Model-authored titles, paths, URLs, and event data are untrusted input.
- Observer output is evidence for display, not approval for a Task, Workflow, merge, or external side effect.

## Testable acceptance criteria

- [ ] A local Observer reads one selected Session without changing its tool surface or lifecycle.
- [ ] Snapshot identity rejects a mismatched Session path, workspace, or epoch.
- [ ] Stale and duplicate cursors resync or no-op without fabricating events.
- [ ] Snapshot and event output stays within byte, count, and queue budgets.
- [ ] Redaction removes configured sensitive fields and reports partial output.
- [ ] Session shutdown closes observers and does not produce a second execution result.
- [ ] There is no network listener, remote command, or write path in the first implementation.
- [ ] A later controller proposal is reviewed separately rather than added to this read-only surface.

Until these checks exist, SessionManager previews and existing OpenPI status projections remain the supported inspection paths.
