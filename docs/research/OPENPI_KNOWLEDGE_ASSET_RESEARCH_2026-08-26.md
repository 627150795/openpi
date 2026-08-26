---
status: validated
created: 2026-08-26
last-verified: 2026-08-26
applies-to: OpenPI documentation and evidence workflow
related-issues: "#45, #84, #197, #198"
related-prs: none
supersedes: none
---

# OpenPI knowledge assets and public evidence

## Question

Can GitHub Issues remain the only place for OpenPI's Benchmark results, research notes, design comparisons and publication records as the project iterates?

## Observed facts

- Issues currently carry discussion, implementation tracking, research, design proposals and Benchmark summaries in the same public timeline.
- The repository already has a tracked design archive and tracked research records, while the local Benchmark harness, reports and run roots are protected by local ignore rules.
- A Benchmark result needs more than a headline: the source revision, model/thinking setting, task and verifier identity, sample size, usage accounting, failure classification, limitations and raw-evidence identity determine what the result supports.
- The latest Luna high result is useful as an internal product signal, but its complete ledgers and Sessions are local operator evidence rather than material to bulk-publish into Git.

## Interpretation

Issues are the right public entry point and collaboration surface, but they are a poor sole knowledge base. A versioned repository report gives a stable citation and code-review boundary; an external evidence archive preserves machine receipts without inflating Git history. A small root index lets both people and Agents choose the correct record without memorizing Issue numbers.

## Recommendation

Use Issues for questions and work tracking, repository documents for reusable conclusions, Decisions for durable constraints, Release notes for shipped behavior, and a separately identified archive for large or sensitive Benchmark evidence. Start forward-only and promote a small number of high-value records before considering broader curation.

## Evidence boundary

This is a repository-structure investigation, not a claim about runtime quality or Benchmark uplift. The linked Issues and repository state are the evidence for the workflow recommendation. Detailed Benchmark measurements remain in the dated Benchmark report and its operator-local receipts.
