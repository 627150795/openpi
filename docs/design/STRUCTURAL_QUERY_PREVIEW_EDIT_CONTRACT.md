# Structural Query and Preview-First Edit Contract

Status: design-only first pass for [issue #165](https://github.com/tt-a1i/openpi/issues/165). This document defines separate query and mutation boundaries; it does not add an AST parser, a new dependency, or runtime write behavior.

## Problem

Text search plus ordinary file editing is useful for many tasks, but it cannot reliably distinguish syntax from comments, strings, or similarly named constructs. A future structural query could reduce those false matches, while a structural rewrite would introduce a new multi-file mutation authority.

Query and mutation therefore need separate contracts. A preview is not permission to write, and a model-generated replacement is not proof that the target files are still unchanged.

## Capability split

```text
structural_query (read-only)
    ├─ parse and search bounded workspace scope
    └─ return matches, parse issues, and partiality

structural_edit_preview (read-only)
    ├─ calculate a proposal from current file bytes
    └─ return proposal identity and before/after previews

structural_edit_apply (write-capable, future)
    ├─ revalidate the complete proposal identity
    ├─ apply atomically or enter explicit recovery
    └─ return changed files and hashes
```

The first implementation, if approved, may expose only `structural_query`. Loading a query capability must not expose or imply a write capability.

## Query contract

A query request must identify:

- one validated workspace or worktree root;
- an explicit language/grammar, or a deterministic language inferred from each path;
- a bounded path scope and exclusion set;
- a structural pattern with bounded captures;
- result limits in files, matches, bytes, and elapsed time.

The response should include:

```text
query_id:
workspace_identity:
language:
parser_identity:
matched_files:
matches:
parse_issues:
unsupported_files:
truncated:
```

`parse_issues`, `unsupported_files`, and `truncated` are part of the result, not logging details. A response with one match and ten unparsed files cannot be reported as a complete workspace search.

Query output is read-only evidence. It cannot edit files, execute a code action, install a grammar, or grant a child mutation authority.

## Preview contract

A preview is computed from exact file bytes and must bind to a stable proposal identity:

```ts
type EditProposalIdentity = {
  proposalId: string;
  workspaceRoot: string;
  paths: ReadonlyArray<string>;
  beforeHashes: ReadonlyArray<{ path: string; sha256: string }>;
  patternDigest: string;
  replacementDigest: string;
  parserIdentity: string;
  toolVersion: string;
};
```

The shape is a design sketch. The invariants are:

- paths are canonical, relative to the authorized workspace, and sorted;
- hashes cover every file that would be read or written;
- the pattern, replacement, parser, and tool version are included;
- the proposal records match counts, changed ranges, and after-content hashes or an equivalent exact digest;
- a preview may be discarded at any time without changing files;
- the preview output is bounded and explicitly marked partial when limits or parse errors apply.

The proposal id is an opaque reference, not a permission token. Anyone presenting it must still pass the current authorization and workspace checks.

## Apply contract

Apply is a separate, explicitly authorized operation. Before the first write it must:

1. resolve the same authorized workspace and path set;
2. re-read every `beforeHash` file;
3. re-run the query/rewrite or verify an exact proposal digest;
4. reject if any file, parser, pattern, replacement, or tool version is stale;
5. verify that no target is outside the allowed worktree;
6. prepare the complete write set before mutating the first file.

If any target is stale, unsupported, ambiguous, or over budget, the operation performs zero writes and returns a structured rejection. It must never silently apply the subset that still matches.

## Multi-file atomicity and recovery

The preferred contract is all-or-nothing application within one authorized worktree. If the platform cannot provide atomic replacement for the full set, the implementation must say so before applying and return a recovery receipt containing:

- operation id and proposal id;
- files intended, changed, skipped, and failed;
- before and after hashes for every touched file;
- the first failure and whether rollback was attempted;
- recovery artifact paths that were runtime-created and validated;
- a `complete`, `partial`, `failed`, or `rolled_back` status.

An apply result with one changed file and one failed file is `partial`, not `success`. A rollback claim requires post-rollback hash verification.

## Authority and child policy

- Query is safe to expose to a read-only child when the parent grants the capability.
- Preview is read-only but may reveal sensitive source context; its result still needs the normal output budget and redaction policy.
- Apply is not available to read-only children by default.
- A child proposal cannot authorize its own apply or widen its path scope.
- Parent review, user authorization, or an existing project write policy must be represented explicitly at the apply boundary.
- Task completion, Workflow acceptance, and merge approval remain separate from an apply receipt.

## Parser and partiality rules

The contract must distinguish:

| State | Meaning | Safe claim |
| --- | --- | --- |
| `complete` | Every in-scope file was parsed and all limits stayed within budget. | The requested scope was fully processed. |
| `partial` | Some files were skipped, truncated, or had parse issues. | Only the returned matches/proposal are known. |
| `unsupported` | No grammar is available for one or more requested files. | No structural claim for those files. |
| `stale` | Files changed after preview. | No write was applied. |
| `rejected` | Authority, scope, pattern, or safety validation failed. | No write was applied. |
| `failed` | The parser or mutation boundary failed unexpectedly. | Preserve the error and verify filesystem state. |

Comments, strings, generated files, symlinks, and mixed-language directories must have explicit handling. Do not guess a grammar or treat a syntax error as an empty file.

## Budgets and safety

- Bound pattern, replacement, capture, match, file, byte, and elapsed-time limits.
- Canonicalize and contain all paths before reading or writing.
- Do not allow model-authored output to choose arbitrary backup or artifact locations.
- Keep raw parser traces and full source excerpts out of model-facing output by default.
- Never install parsers, execute server code, or run arbitrary code as a query side effect.
- Treat symlink targets, generated files, and untrusted project configuration as explicit policy decisions.

## Benchmark before implementation

Compare three paired arms on a fixed corpus:

1. `rg` + read + ordinary edit;
2. structural query + ordinary edit;
3. structural query + preview-first mutation.

Include API rename, import migration, argument migration, mixed formatting, comments/strings that resemble the pattern, syntax errors, and an external file change between preview and apply. Record correct matches, missed matches, false matches, accidental edits, tool calls, tokens, latency, partial-result interpretation, stale rejection, multi-file recovery, and unused capability overhead.

## Future checklist

- [ ] Decide whether a maintained parser package or a Pi-native package owns the capability.
- [ ] Implement and test query-only behavior before any mutation path.
- [ ] Add machine-readable partial, stale, unsupported, and rejected states.
- [ ] Test stale preview at the first-write boundary and prove zero writes.
- [ ] Test multi-file failure, rollback, and post-operation hash verification.
- [ ] Verify child query/apply authority separately.
- [ ] Run the paired benchmark and publish raw counters before choosing a default.

Until these checks exist, this document is a design reference and OpenPI continues to use its existing text-search and file-editing paths.
