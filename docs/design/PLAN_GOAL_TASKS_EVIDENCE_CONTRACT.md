# Plan, Goal, Tasks, and Evidence Contract

Status: design and research contract. This document explains why a Todo-like
list has not disappeared from strong agent harnesses, why it should remain an
on-demand aid, and how OpenPI should separate Plans, Goals, Session Tasks, and
completion evidence.

It describes the current boundary and does not add a new planning system,
automatic scheduler, task executor, or evidence verifier.

## Decision

OpenPI should keep four concepts distinct:

| Concept | Question it answers | Lifetime | Authority |
| --- | --- | --- | --- |
| Plan | “What sequence of steps do I propose before implementation?” | Planning phase or approval boundary | A proposal awaiting explicit action |
| Goal | “What user objective should remain active across turns?” | Session goal lifecycle | Goal controller plus user action |
| Tasks | “What work-intent items remain in this current batch?” | Session branch and active batch | Advisory record only |
| Evidence | “What proves that a requested outcome is true?” | Owned by the observed artifact or action | Files, Git, tests, tools, artifacts, and user confirmation |

Plans, Goals, and Tasks record intent or coordination. None of them turns a
claim into a fact. A task marked `done` is a recorded claim with a note; it is
not a verifier. A Goal marked complete is a claim that the objective was
audited; it is not proof supplied by the status field itself.

The practical rule is:

> Use a short plan for a complex decision, a Goal for continuity, Tasks for
> cross-turn work intent, and the repository/runtime evidence to decide whether
> the work is actually complete.

## 1. Why Todo did not disappear

Strong models often need fewer persistent checklists for short, linear work,
but that is not the same as needing no plan. A checklist becomes useful when:

- the user gives several explicit deliverables;
- work spans multiple model turns or Sessions;
- independent pieces can be completed in parallel;
- a blocker must remain visible after compaction or resume;
- the agent must distinguish pending work from completed evidence;
- the user needs a compact progress view rather than a transcript.

It becomes harmful when it is used as a per-step scratchpad, injected into every
request, or treated as a second source of truth. The right response to stronger
models is lower default ceremony and clearer boundaries, not deletion of the
concept.

## 2. Plan

### 2.1 Meaning

A Plan is a proposed implementation or investigation sequence. It explains
what the agent intends to inspect, change, and verify. It should remain easy to
revise while the agent is learning facts.

OpenPI Plan Mode is read-only while planning. The model can investigate through
the allowed read/search/Git tools and can ask for `plan_ready` only when the
plan is decision-complete. `plan_ready` is a boundary, not approval: the user
chooses whether to continue planning, implement in the current Session, start a
fresh Session, or turn planning off.

### 2.2 Plan contract

A valid plan should contain:

- the concrete objective;
- relevant current-state evidence;
- ordered or independently executable steps;
- files/components likely to change;
- tests or checks that would prove each step;
- risks, assumptions, and unresolved choices;
- an explicit next action for the user or agent.

The plan must not claim that an unrun test passed, that a file was changed, or
that the user approved an implementation. Those are evidence or authorization
facts outside the plan.

### 2.3 Plan persistence

Plan state is branch-local Session state. A malformed latest state should keep
writes blocked or require an explicit reset; it must not silently restore a
broader or older plan. The plan text must stay bounded and sanitized before it
is persisted or shown.

## 3. Goal

### 3.1 Meaning

A Goal is the durable user objective that remains relevant across several
turns. It is broader than a single implementation plan and narrower than a
project backlog.

Current OpenPI Goal state includes an objective, revision, lifecycle status,
usage counters, optional token budget, continuation information, reasons, and
completion acknowledgement.

The lifecycle distinguishes active, paused, blocked, usage-limited,
budget-limited, complete, and cleared states. Resuming a paused, blocked, or
usage-limited Goal is an explicit action; it is not an automatic inference from
the next user message.

### 3.2 Goal contract

- A Goal records the user's objective, not every intermediate step.
- A Goal may outlive a Plan and may require several Plans.
- A Goal may be blocked without being failed or complete.
- Completion requires a requirement-by-requirement evidence audit.
- Usage limits are lifecycle facts, not evidence that the objective was met.
- Clearing a Goal ends its active continuity; it does not delete external work.

The Goal controller can protect a long-running objective from accidental
continuation, but it must not reinterpret a plausible final answer as proof of
completion.

## 4. Session Tasks

### 4.1 Meaning

Session Tasks are a compact, branch-correct record of work intent. They answer
“what is still open in the work I am doing now?” They do not answer “what has
ever been completed in this repository?” and they do not execute or schedule
anything.

The current model-facing tools are:

```text
tasks_add
tasks_update
tasks_list
```

Their descriptions explicitly say that Subagents and Workflows execute work,
while Tasks only record advisory intent.

### 4.2 Current Task state

The current v1 snapshot is deliberately small:

```text
version
revision
nextId
items[]
```

Each item contains a branch-local numeric ID, subject, optional detail,
status, and optional note. The statuses are:

```text
pending | in_progress | blocked | done | dropped
```

`blocked`, `done`, and `dropped` status changes require a fresh note. A note
can cite a blocker, observable evidence, or a drop reason. Tasks store that
claim but do not verify it.

Multiple items may be `in_progress` when work is concurrent. This is more
honest than forcing parallel work into a single artificial active row.

### 4.3 Batch semantics

Tasks are grouped into the current active batch. When every item in a batch is
`done` or `dropped`, the batch closes and the live list clears. The next
`tasks_add` begins a new batch and may reuse display ID `T1`.

The old notes remain in Session history, but a closed batch is not kept in the
live projection. This prevents completed work from accumulating into every
future prompt and makes Task IDs branch-local references rather than global
identities.

### 4.4 Persistence and branches

Task snapshots are persisted as Pi Session custom entries and restored from the
active branch. This gives the intended behavior:

- `/resume` and `/reload` restore the current branch's tasks;
- `/tree` follows the selected branch;
- `/fork` inherits the snapshot up to the fork point;
- a new Session starts empty;
- `context_pivot` keeps the same Session and therefore preserves the task state.

Restore chooses the highest valid revision on the current branch. A later
malformed or unknown snapshot must lock restoration rather than silently
reviving an older state. Snapshot bytes and field lengths are bounded before a
candidate mutation is committed.

### 4.5 Model visibility

Task projection should be transient and bounded. It should be added to the
model request only when actionable items exist and should not be persisted as a
new permanent message on every turn.

The projection should:

- say that Tasks are advisory context;
- warn against resuming unrelated work merely because an item exists;
- identify that files, Git, tests, tools, artifacts, and user confirmation are
  the truth;
- prioritize `in_progress`, `blocked`, then `pending`;
- point to `tasks_list` for details;
- survive compaction by referring to the current task list instead of creating
  duplicate items.

This keeps dynamic task text near the request tail and avoids unnecessary
prompt-prefix churn.

## 5. Evidence

### 5.1 Evidence is not status

The following are evidence candidates, not automatic proof:

| Candidate | What it can prove | What it cannot prove alone |
| --- | --- | --- |
| Passing test | That the covered assertions passed in that environment | Every requirement or untested path |
| Commit | That a change was recorded in a Git history | That the change is correct or pushed |
| Tool result | That a tool returned a result | That the result is complete or truthful |
| Artifact | That exact material was retained under an owner policy | That its interpretation is correct |
| Review/approval | That a reviewer made a decision | That runtime behavior was tested unless stated |
| User confirmation | That the user accepted the stated outcome | That hidden technical assumptions are true |

Task and Goal notes should point to one or more of these sources. They should
not replace the source or overstate its scope.

### 5.2 Evidence wording

Prefer precise notes:

```text
done: targeted Windows path test passed; full suite not run
blocked: upstream PR #225 already owns the fix
dropped: duplicate of merged PR #28
```

Avoid unsupported notes:

```text
done: everything works
done: tests pass
```

unless the note names which tests, environment, revision, and relevant
requirement were actually covered.

### 5.3 Evidence ownership

The owner of the evidence remains authoritative:

- the test runner owns its output and environment;
- Git owns commits and refs;
- the artifact producer owns exact stored bytes and retention;
- GitHub owns review and CI status;
- the user owns explicit approval or confirmation.

Tasks and Goals may link to those sources but must not become a universal
evidence database.

## 6. How the concepts interact

```text
Goal (why)
  -> Plan (proposed route)
      -> Tasks (current work-intent items)
          -> Subagent / Workflow / tools (actual execution)
              -> Files, Git, tests, artifacts, reviews (evidence)
```

The arrows describe coordination, not automatic state mutation.

### Plan to Tasks

A user or model may turn a multi-step plan into Task items, but the conversion
must remain explicit. Plan steps are proposals; Task items are current work
intent. Revising a plan does not silently mark an existing task complete.

### Tasks to execution

Subagents and Workflows may be used to execute a Task, but v1 does not
automatically attach an executor or mark a task done when a child returns.
The parent reviews the result and records a note with the relevant evidence.

### Goal to Plan

A Goal may be active while multiple Plans are explored. Pausing or blocking a
Goal does not delete the Plan or claim that the repository is unchanged.

### Context pivot

Context Pivot changes the active model-visible context while keeping the same
Pi Session. It should carry enough current Task/Goal references to continue,
but it is not a Task snapshot, Plan approval, or completion proof.

### Replay and resume

Replay can reuse only operations whose own safety and fingerprint contracts are
verified. A restored Task or Goal is intent state, not permission to replay
tools or claim that old evidence still covers the current worktree.

## 7. Anti-patterns

Avoid these failure modes:

- using Tasks for every small command and creating status churn;
- making a successful child automatically complete a parent Task;
- treating `done` as a verifier result;
- persisting a task projection into every model request;
- injecting all historical completed tasks after every compaction;
- making one `in_progress` item mandatory when work is parallel;
- letting a Goal's usage limit masquerade as task completion;
- turning a Plan Ready event into implicit user approval;
- using a task ID as a global project identity across batches or branches;
- introducing a global task database before a real cross-Session use case exists.

## 8. Comparison lessons

| Harness pattern | Useful lesson | OpenPI boundary |
| --- | --- | --- |
| Codex `update_plan` | A small replace-all checklist works for short runs | Keep Plans ephemeral and do not confuse them with Plan Mode |
| Claude ID-addressed Tasks | Stable IDs and incremental updates help across turns | Use branch-local Session Task IDs, not a global project ledger |
| Maka task ledger | Blocked/failed reasons and evidence improve auditability | Do not copy its event store, scheduler, or cross-session complexity |
| Pi Session extensions | Custom entries and branch scanning provide native persistence | Let Pi own Session history and branch reconstruction |

The middle ground is intentional: more durable than a scratch checklist, less
ambitious than a project-management runtime.

## 9. Minimal recommendation

1. Keep Plan Mode read-only until an explicit Plan Ready action and user choice.
2. Keep Goals for user objectives spanning turns, budgets, and continuation.
3. Use Tasks only for explicit lists or work spanning multiple turns/runs.
4. Keep Task snapshots small, branch-correct, advisory, and transiently
   projected.
5. Require a fresh note for blocked, done, and dropped status changes.
6. Let actual files, Git, tests, tools, artifacts, reviews, and user
   confirmation carry the evidence.
7. Do not auto-complete Tasks from Subagent/Workflow outcomes in v1.
8. Add richer ownership, dependencies, deadlines, or a global store only after
   a benchmark demonstrates that the current model loses work without them.

## 10. Non-goals

- Removing Session Tasks because simple tasks need no checklist.
- Making Tasks a scheduler, Workflow engine, or Subagent controller.
- Adding a project-global task database.
- Automatically declaring evidence valid or tasks complete.
- Treating Plan Ready as user approval.
- Persisting a full task projection into every prompt.
- Replacing Pi Session, branch, compaction, or Goal lifecycle ownership.

## Sources

Current OpenPI implementation and user-facing contract:

- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/tasks/tasks.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/tasks/index.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/goal/state.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/goal/index.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/plan-mode/index.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/README.md

OpenPI design and comparison research:

- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/docs/design/TASKS_DESIGN.md
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/docs/design/TASKS_EVALUATION.md
- https://github.com/tt-a1i/openpi/issues/43
- https://github.com/openai/codex/tree/main
- https://code.claude.com/docs/en/agent-sdk/todo-tracking