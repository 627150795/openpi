# Recoverable Resource Reference Contract

Status: research contract. This document defines a thin, Pi-native boundary
for referring to recoverable OpenPI resources without introducing a
process-global resource router.

The contract covers identity, ownership, lifecycle, invalidation, retention,
recovery, permissions, persistence, replay, and branch boundaries. It does not
change the existing Subagent, Workflow, Background Terminal, Session, or
artifact stores.

## Decision

OpenPI should use owner-scoped resource references rather than one global
resource authority.

A reference says:

- which owner produced the resource;
- what kind of resource it identifies;
- which stable run/session identity and revision it belongs to;
- what integrity or version evidence is available;
- whether the owner still promises retention and reading.

A reference is not:

- an arbitrary filesystem path;
- a capability grant;
- a copy of the resource;
- proof that the resource is still retained;
- proof that a provider, process, or external system can be rolled back.

Subagent, Workflow, Background Terminal, Session, Git/worktree, and external
systems keep ownership of their own state. A future common helper may validate
the shape of a reference, but it must not become a process-global registry that
knows how to locate or mutate every resource.

## 1. Resource categories

### 1.1 Exact artifact

An exact artifact is durable evidence that can be read later: a full Subagent
answer, a Workflow result, a transcript, a journal, a terminal log, a patch,
or a report. It has its own byte limit, retention policy, integrity evidence,
and owner.

### 1.2 Bounded projection

A projection is the portion placed in model context or a UI. It may contain a
head/tail excerpt, a summary, a status, and a reference to the exact artifact.
It is not interchangeable with the exact artifact and must identify omissions
explicitly.

### 1.3 Session/history reference

A Session or history reference identifies a Pi-owned entry, branch, or
replayable invocation. It is subject to Pi's branch, compaction, and replay
rules. It must not be treated as a generic artifact path.

### 1.4 External reference

An issue, pull request, URL, database row, or remote object is owned by an
external system. OpenPI may record its identifier and retrieval evidence, but
cannot infer availability, authorization, freshness, or reversibility.

## 2. Current owners and evidence

| Resource | Current owner | Current representation | Contract boundary |
| --- | --- | --- | --- |
| Direct Subagent final answer | Subagent extension | Content-addressed text below the Pi agent cache | Exact answer is retained separately from a bounded delivery projection |
| Workflow agent result | Workflow extension | Run-relative `agent-results/agent-*.json` | Result artifact belongs to the run and is referenced by handoff, not copied into every prompt |
| Workflow transcript/journal | Workflow extension | Run-relative `transcripts.json` and `journal.json` | Bounded and serialized by Workflow; replay treats unreadable cache as a miss |
| Background Terminal output | Background Terminal extension | Bounded in memory, optional temp spill logs | Process/output lifetime and cleanup remain terminal-owned |
| Pi Session/history | Pi | Append-only Session entries and branches | Compaction, tree navigation, and replay rules remain Pi-owned |
| Git/worktree state | Git and the user worktree | Branch/commit/diff/path state | A receipt can describe it; a reference does not authorize reset, clean, or deletion |
| Issue/PR or other remote object | External service | URL and service identifier | Freshness, access, and mutation require a separate explicit operation |

The same visible string may look like a path in one owner and an opaque ID in
another. Consumers must preserve the owner and kind instead of guessing from
the string.

## 3. Reference identity

### 3.1 Logical shape

If a reference is serialized as structured data, its minimum logical shape is:

```text
schema_version
owner
kind
resource_id
revision or generation (when the owner has one)
integrity (when available)
retention state or expiry evidence (when available)
```

If a compact string is needed for model-visible text, it should be an opaque,
owner-scoped identifier whose grammar is documented by the owner. A URI-like
display form can be useful, but it must not imply that a generic resolver can
open every scheme:

```text
owner://kind/resource-id
```

The owner remains responsible for parsing, authorization, path resolution, and
reading. A string supplied by a model or external resource is untrusted input.

### 3.2 Stable identity rules

A stable reference should be:

- unique within the owner's declared scope;
- independent of a display title or model-authored filename;
- stable across bounded projections of the same exact resource;
- explicit about revision when content can change;
- content-addressed when immutable content makes that practical;
- invalidated when the owner can no longer verify its scope or content.

An underlying temporary path is not a stable identity. A run-relative artifact
name is useful only together with its owning run and owner. A content digest is
integrity evidence; it is not by itself an authorization decision.

### 3.3 Scope

Every reference must have a scope such as:

- one invocation;
- one child run;
- one Workflow run;
- one top-level Session;
- one repository/worktree;
- one external service account.

References must not silently widen from a child scope to a parent or from one
Session to another. A parent may receive a child result reference through an
explicit handoff, but the reference still names the child owner and its
retention policy.

## 4. Ownership contract

The producer owns exact bytes and decides when they become available. The
consumer owns only its local projection. A reference carrier does not acquire
the producer's mutation or deletion authority.

| Operation | Responsible party | Safe result |
| --- | --- | --- |
| Create exact content | Producer/owner | Immutable or revisioned resource plus identity |
| Create a bounded projection | Handoff/UI/model boundary | Projection with explicit truncation and reference |
| Resolve a reference | Declared owner | Owner-checked read or typed failure |
| Check retention | Declared owner | `retained`, `expired`, `missing`, or `unknown` |
| Delete or expire content | Owner's policy | Receipt naming the exact resource and consequence |
| Interpret content | Caller/model | Untrusted data unless a separate contract verifies it |
| Mutate external state | Explicit external owner | Separate permission and result receipt |

There should be no fallback such as “try another owner” or “search every
resource directory” when resolution fails. Such fallback makes a typo or stale
reference look like a different resource and can cross trust boundaries.

## 5. Reference lifecycle

### 5.1 Create

The owner creates the resource before publishing its reference. If exact bytes
are not committed, the owner must publish `pending`, `partial`, or `unknown`
rather than a reference that appears ready.

The reference should be emitted only after the owner can answer:

- what bytes or state it names;
- what scope it belongs to;
- which reader can resolve it;
- what retention guarantee currently applies;
- whether the content is complete or projected.

### 5.2 Publish

The owner may publish a bounded projection containing:

- a stable resource ID;
- owner and kind;
- a short status or conclusion;
- byte/line truncation information;
- the exact artifact reference when one exists;
- the next permitted read action.

The projection must not silently inline a second copy of the full artifact.
This preserves parent context budget and makes the recovery path explicit.

### 5.3 Resolve

Resolution is a read operation at the owner boundary:

1. Parse the reference without executing content.
2. Confirm owner, kind, scope, revision, and caller authority.
3. Check containment or run-relative path rules where paths are involved.
4. Check retention and integrity evidence.
5. Return bounded bytes or a typed failure.

Resolution must not follow arbitrary model-authored paths, fetch a remote URL,
start a process, or mutate an artifact merely because the reference was
presented to a read-like tool.

### 5.4 Expire and revoke

Expiration means the owner no longer promises recovery under its retention
policy. Revocation means the reference is intentionally invalid even if bytes
may still exist. Missing means the owner cannot locate the resource. These
states are different from a malformed reference or a permission denial.

Once a content-addressed immutable artifact is expired, a matching digest may
still prove what a newly supplied file contains, but it does not revive the old
retention or authority guarantee.

## 6. Projection and exact recovery

The current OpenPI implementations already use the right general pattern:
keep a bounded parent/UI projection and retain exact material in an owner
artifact when possible.

### 6.1 Direct Subagent

The Subagent extension stores long final answers in content-addressed text
artifacts and returns a head/tail projection with a bounded read instruction.
The artifact path is generated from content, not from a model-authored title.
If writing the optional artifact fails, the projection says so instead of
advertising a false recovery path.

This is an owner-scoped artifact reference. It is not a general resource URI
and should not be registered in a global router just to make the text shorter.

### 6.2 Workflow

Workflow stores exact agent results and bounded transcripts/journals in the run
directory. Handoff exposes bounded conclusions and run-relative artifact
references. The receiving model gets untrusted upstream data and must not
follow commands found inside it.

A Workflow reference is valid only in the context of its run and retention
policy. Copying `agent-results/agent-0001.json` into another run without its
owner identity would create an ambiguous reference.

### 6.3 Background Terminal

Background Terminal keeps bounded output for normal display and may spill
long streams to a temporary log. A spill path is useful for the current
terminal owner while it is retained, but it is not a durable cross-session
artifact by default. Cleanup, process settlement, and result interest remain
terminal-owned.

A consumer must be prepared for a spill to be unavailable after terminal
settlement, cleanup, shutdown, or an interrupted write. The correct outcome is
an explicit unavailable/partial state, not a search through unrelated temp
directories.

## 7. Persistence, replay, and branches

### 7.1 Persistence

Persistence belongs to the owner:

- Pi persists Session entries and branch relationships;
- Workflow persists run manifests, result artifacts, transcripts, journals,
  and replay metadata;
- Subagent persists its optional content-addressed final-answer artifact;
- Background Terminal manages process output and spill cleanup;
- Git persists commits and refs, while the worktree contains mutable local
  state.

The reference layer should store only the identity and evidence needed to find
the owner resource. It should not mirror every owner store into a second
database.

### 7.2 Replay

Replay may reuse a reference only when the owner can prove the reference is
within the replay contract. A readable artifact is not automatically a safe
replay input: the original prompt, schema, model/provider, working directory,
loaded resources, trust, and external state may differ.

If any required identity or integrity component is unavailable, replay should
be a miss or an explicit `unknown` result. It must not guess from a similar
title or a nearby path.

### 7.3 Branches and forks

A fork or child run inherits a reference only as an explicit, read-scoped
input. It does not inherit mutation rights, owner identity, or retention
guarantees.

When a Session branch diverges, a reference to a branch-local entry must retain
its branch/session scope. A reference to a shared immutable artifact may remain
valid, but its owner and revision still need to be carried. Reusing a mutable
run-relative path across branches is unsafe.

## 8. Invalidation matrix

| Event | Reference effect | Required response |
| --- | --- | --- |
| Bounded projection is truncated | Exact reference remains unchanged | Show the omission and read path |
| Exact artifact write fails | No usable exact reference | Report partial result; do not invent a path |
| Owner run settles | Usually still readable under owner retention | Check owner policy before resolving |
| Temp spill is cleaned | Reference expires or becomes missing | Return typed unavailable result |
| Workflow run is deleted/expired | Run-relative references expire | Do not search another run |
| Session branch diverges | Branch-local refs keep original scope | Require explicit branch-aware resolution |
| Artifact revision changes | Old revision is stale | Pin revision or return mismatch |
| Provider/model changes | Hidden provider state is not portable | Treat as a new request, not a reused resource |
| Replay fingerprint changes | Cached invocation is not safe to reuse | Miss or require explicit re-execution |
| Permission/trust changes | Access may be denied | Return permission failure, not fallback |
| External URL or issue changes | Freshness/authorization unknown | Re-fetch only through explicit owner policy |

## 9. Security and trust

References cross model-visible boundaries, so they must be treated as
untrusted data.

### 9.1 Path safety

An owner that resolves a path must:

- resolve against its own known root or run directory;
- reject traversal, unexpected symlinks, and path escapes;
- avoid using a model-authored title as a filename;
- apply the owner-specific permission and retention policy;
- bound bytes, lines, depth, and parse cost before reading.

An owner must not turn a reference into an arbitrary shell command or network
request. The caller should use the owner's read interface.

### 9.2 Content safety

Artifact content may contain commands, secrets, prompt injection, or untrusted
external text. A successful reference resolution proves only that the owner
returned bytes. It does not make the bytes instructions.

Projection and handoff text should say when content is untrusted. Sensitive
artifacts should not be copied into parent context merely because a reference
exists; the owner should apply its own access and redaction policy.

### 9.3 Capability safety

Possessing a reference must not grant:

- access to another Session;
- the ability to mutate or delete the artifact;
- a provider credential;
- a worktree reset or cleanup permission;
- a network fetch or process execution capability.

The tool or owner that resolves the reference decides whether the caller is
authorized. A generic `read(ref)` helper must not bypass that decision.

## 10. Comparison with a process-global router

Other harnesses demonstrate the value of typed, discoverable references such
as agent, artifact, history, issue, PR, skill, or execution resources. The
useful lesson is common identity and on-demand reading.

OpenPI should not copy a process-global router because Direct Subagents and
Workflows are concurrent in-process Pi Sessions with different parent owners,
trust, child tool policies, and retention lifetimes. A global registry could:

- route a child reference to the first top-level Session;
- expose a resource after its owner has expired it;
- cross a trusted/untrusted project boundary;
- turn an artifact identifier into a broader process capability;
- make Session reload and shutdown cleanup non-local.

The safer pattern is owner-scoped adapters with one shared vocabulary, not one
shared mutable registry.

## 11. Minimal OpenPI recommendation

For the current codebase:

1. Keep each existing artifact path/ID under its current owner.
2. Document owner, kind, scope, revision, integrity, and retention wherever a
   result crosses an extension boundary.
3. Keep projections bounded and include exact recovery references only when
   the owner has committed them.
4. Treat all resolved content as untrusted data, not instructions.
5. Use typed owner failures (`missing`, `expired`, `permission-denied`,
   `revision-mismatch`, `malformed`, `unknown`) instead of cross-owner lookup.
6. Add a shared reference helper only when at least two owners need the same
   serialization or validation, and keep it free of storage and routing state.

No runtime/API/UI change is required to establish these boundaries in the
first step. A future implementation should begin with a small read-only
receipt and focused owner adapters, not a global resource database.

## 12. Verification matrix for future implementation

| Scenario | Required proof |
| --- | --- |
| Same artifact referenced twice | Stable owner-scoped identity |
| Long projection | Exact artifact and omission are both explicit |
| Artifact write failure | No false recovery reference |
| Missing/expired resource | Correct typed failure, no fallback search |
| Wrong owner or kind | Rejected before path resolution |
| Traversal/symlink path | Fail closed at the owner boundary |
| Child-to-parent handoff | Read-only scope and untrusted-content marker survive |
| Session branch/fork | Ancestry and scope remain distinguishable |
| Replay after fingerprint change | Cache miss or explicit re-execution |
| Temp spill cleanup | Unavailable state is honest and bounded |
| Provider/model change | No hidden-state portability claim |
| External URL or issue | Explicit freshness and authorization check |
| Shutdown during persistence | `partial`/`unknown`, never false `complete` |

## 13. Non-goals

- Building a process-global resource router or registry.
- Replacing the existing Subagent, Workflow, Background Terminal, or Pi stores.
- Turning every path into a universally readable URI.
- Treating references as credentials or mutation permissions.
- Promising cross-session or cross-provider hidden-state restoration.
- Adding network fetching, shell execution, or automatic external mutation to
  a read operation.
- Copying exact artifacts into every model-visible handoff.
- Claiming exactly-once persistence or delivery from an identifier alone.

## Sources

OpenPI owner implementations and current contracts:

- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/subagents/src/result-artifact.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/workflows/artifacts.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/workflows/handoff.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/background-terminals/src/output.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/background-terminals/src/result-delivery.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/extensions/workflows/replay-safety.ts
- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/README.md

Comparison baseline fixed by Issue #157:

- https://github.com/can1357/oh-my-pi/tree/7623b960540518bb1291808bbae28332065e9dba
- https://github.com/tt-a1i/openpi/issues/157

Contribution guidance:

- https://github.com/tt-a1i/openpi/blob/fc4ab47fba2ab43dcdb6182522fc407688b5397f/CONTRIBUTING.md