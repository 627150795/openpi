# OpenPI documentation

This directory is the repository's canonical home for durable project knowledge. GitHub Issues remain the public discussion and work-tracking surface; they are not the only copy of a reusable conclusion.

## Choose the record

| Need | Canonical record | Put in it |
| --- | --- | --- |
| Discuss a question or track work | GitHub Issue | Context, alternatives, status, decisions still needed |
| Record sourced investigation | [`research/`](research/) | Facts, sources, evidence boundary, inferences, unknowns |
| Preserve design exploration | [`design/`](design/) | Alternatives, trade-offs, rejected approaches, evolution |
| Record a durable project choice | [`decisions/`](decisions/) | Selected constraint, rationale, consequences, superseded choice |
| Describe stable runtime structure | [`architecture/`](architecture/) | Current ownership, seams, lifecycle and authority boundaries |
| Report a formal measurement | [`benchmarks/`](benchmarks/) | Protocol, frozen identities, results, limitations, rerun entry point |
| Describe shipped user behavior | Release notes | Version-specific user-visible changes |

An Issue should link to its canonical document after a conclusion becomes reusable. The document should link back to the Issue, relevant PRs, the source revision, and the evidence receipt. Keep the Issue history intact; a canonical document is a projection, not a replacement.

## Document states

Governed research, design, Decision, architecture and Benchmark records use one of these states:

- `draft`: a working record that is not yet a project constraint;
- `validated`: checked against the listed sources, code revision, or run receipt at the stated verification date;
- `superseded`: retained for history but replaced by a newer record.

Each governed record states its creation date, last verification date, applicable OpenPI revision or version, related Issues/PRs, and superseding relationship when relevant. Separate verified facts, inferences, recommendations and unknowns.

## Evidence rules

Formal Benchmark publication has three linked projections:

1. an Issue summary for communication and discussion;
2. a versioned repository report for protocol and interpretation;
3. a content-addressed raw-evidence archive for complete machine receipts.

Commit only reviewed, credential-free summaries, manifests, protocols and rerun configuration. Keep large JSONL, logs, Sessions, candidate workspaces, caches and private settings in a separately identified archive with size and SHA-256 receipts. Local ignored Benchmark assets are user-owned evidence and are never bulk-added as part of documentation work.

## Agent entry point

The root `AGENTS.md` contains the always-needed cross-Agent invariants. Read this index when a task produces reusable research, a design choice, a formal Benchmark result, or a publication claim; follow the category-specific index before editing or publishing.
