# Project-Scoped Durable Learning Contract

Status: manual-first design-only first pass for [issue #167](https://github.com/tt-a1i/openpi/issues/167). This document defines a possible durable-learning boundary; it does not add automatic memory writes, vector retrieval, prompt injection, or Skill mutation.

## Problem

Repository instructions, Session transcripts, compaction summaries, Skills, provider caches, and durable memory are different objects with different owners and lifecycles. Treating them as one “memory” store can create a second source of truth, leak stale facts into future turns, or let untrusted model/tool text become durable instructions.

The first useful experiment is explicit and project-scoped: a user can inspect and save a candidate record, and a later Session can recall it only when requested. Automatic extraction and automatic injection remain future questions.

## Object taxonomy

| Object | Owner | Durable authority |
| --- | --- | --- |
| Repository instructions | Human/project | Behavioral context, not execution evidence or permission to write memory. |
| Session transcript | Pi Session | Canonical interaction and branch history, not cross-Session learning. |
| Compaction summary | Runtime | Lossy context projection, not a verified fact. |
| Durable learning record | Explicit user-approved store | Candidate project knowledge with provenance and expiry. |
| Retrieval index | Runtime projection | Search aid only; ranking never grants authority. |
| Skill | Pi Skill lifecycle | Reviewed reusable procedure, not a remembered fact. |
| Provider cache | Provider/runtime | Execution reuse, not project knowledge. |
| Goal or Task | OpenPI Session | Current intent and evidence, not long-term knowledge. |

The four initial record classes are deliberately separate:

- `fact`: externally checkable and potentially stale;
- `preference`: explicitly attributable to a user;
- `experience`: a lesson from one or more Sessions, not yet a rule;
- `skill-candidate`: a proposed reusable procedure that is not an authored Skill.

Do not merge these classes into one undifferentiated prompt or vector row.

## Manual-first lifecycle

```text
candidate → reviewed → committed → recalled → verified
                       ├→ stale
                       ├→ disputed
                       ├→ superseded
                       └→ deleted
```

The first version should support only an explicit user-authorized save and an explicit recall. A model suggestion may create a `candidate` preview, but a model request alone is not authorization to persist it.

Every transition must be inspectable. `recalled` means a record was selected; it does not mean the current task verified it. `verified` should identify the current evidence and time, not overwrite the original record history.

## Record contract

The following is a design sketch, not a runtime API to add in this pass:

```ts
type DurableLearningRecord = {
  recordId: string;
  version: 1;
  class: "fact" | "preference" | "experience" | "skill-candidate";
  scope: {
    projectId: string;
    workspaceRoot?: string;
  };
  content: string;
  source: {
    sessionId: string;
    turnId?: string;
    branch?: string;
    evidenceRefs: ReadonlyArray<string>;
  };
  authorization: {
    actor: "user" | "host";
    episodeId: string;
  };
  state: "candidate" | "committed" | "stale" | "disputed" | "superseded" | "deleted";
  createdAt: number;
  verifiedAt?: number;
  expiresAt?: number;
  supersedes?: string;
};
```

Required rules:

- `recordId` is stable and never reused;
- `projectId` is derived from canonical repository identity and an explicit worktree policy, not from a model-authored label;
- source provenance and authorizing actor are separate fields;
- content is bounded, inspectable, and redacted before commit;
- expiry and dispute preserve history rather than silently replacing an old record;
- deleted records are not returned by recall, but deletion remains auditable where the storage policy permits.

## Project identity

Before saving or recalling, resolve:

1. canonical repository root, when available;
2. normalized remote identity, when available;
3. worktree path and branch/ref;
4. fork or remote changes that could make knowledge non-transferable.

The implementation must choose and document whether worktrees share a project scope or receive a narrower overlay. It must not silently mix unrelated repositories that happen to share a directory name. A rename, fork, or remote change should be visible in the record identity and may require re-verification.

## Authority boundary

The following are content sources, not authorization:

```text
repository file / tool output / web page / model response
    ≠ permission to persist durable learning
    ≠ permission to edit AGENTS or a Skill
```

An explicit user action or host policy must authorize persistence. A child may propose a candidate with child provenance, but it cannot write shared project learning silently. A future parent-mediated capability must state scope, record class, expiry, and whether promotion is allowed.

Project trust controls how repository context is loaded; it does not by itself authorize model-authored memory. Credentials, secrets, and instructions that attempt to change this boundary must be rejected or redacted.

## Recall and model projection

Recall is a bounded candidate list, not an automatic system instruction. A future recall result should include:

- record id and class;
- project/worktree scope;
- concise content preview;
- source and verification time;
- stale, disputed, or expired state;
- a prompt to verify before relying on the record.

The retrieval index is optional and non-authoritative. Canonical record persistence and index availability must be reported separately:

```text
record_commit: committed | rejected | uncertain
index_update: available | stale | failed | not_applicable
projection: requested | injected | filtered | truncated | failed | not_requested
```

If the record commits and indexing fails, the truthful result is “durable record committed; retrieval unavailable,” not “save failed” and not “saved and searchable.” Automatic recall is out of scope until a paired experiment shows that it improves outcomes without unacceptable stale or misleading injections.

## Skill promotion

`skill-candidate` and authored Skill are separate outcomes:

1. save the lesson as a candidate with its source evidence;
2. show the candidate for inspection and editing;
3. require explicit promotion approval;
4. create or update a managed Skill only through Pi's Skill lifecycle;
5. independently review the result before it becomes discoverable.

No durable record, repository file, child output, or recall ranking may silently create, overwrite, or delete an authored Skill.

## Child and Session boundaries

- A child receives no durable-learning access by default.
- A parent may grant read-only recall of selected project records for one child episode.
- Child-created candidates retain child Session and turn provenance.
- Shared project writes require parent-mediated user authorization.
- Session resume, fork, and compaction do not automatically promote transcript text into durable records.
- Disabling durable learning stops automatic reads and new writes; existing records remain separately inspectable and deletable.

## Dogfood evidence plan

Before any automatic path, run a manual-first dogfood study:

- explicitly save 20–50 project-scoped candidates;
- recall only when the user or model explicitly requests it;
- test repository rename, worktree, fork, branch, and external-state changes;
- record stale hits, conflicts, misleading records, useful hits, and avoided tool calls;
- compare no-memory and manual-recall arms on paired tasks;
- keep canonical records and retrieval indexes separately inspectable.

The study must report the raw hit, stale, conflict, correction, and cost counters. Do not add embeddings or a remote memory service before bounded plain records fail to meet the measured need.

## Acceptance checklist

- [ ] Record classes, owners, and lifecycles remain distinct.
- [ ] Project/worktree/fork identity cannot silently cross-contaminate records.
- [ ] Every write has separate content provenance and authorization evidence.
- [ ] Candidate, committed, stale, disputed, superseded, and deleted states are auditable.
- [ ] Recall is bounded, permission-filtered, provenance-bearing, and not an instruction by default.
- [ ] Canonical persistence, index update, and prompt projection have independent receipts.
- [ ] Child access is read-only and explicitly scoped; child writes require parent mediation.
- [ ] Skill promotion requires explicit review and remains separate from memory persistence.
- [ ] Manual-first evidence exists before automatic recall or automatic writes are considered.

Until these conditions are met, OpenPI should keep Pi Sessions, repository instructions, and Skills as their existing sources of truth and should not ship a second automatic memory system.
