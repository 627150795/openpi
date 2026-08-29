# Structured Subagent Result Contract

Status: design-only first pass for [issue #155](https://github.com/tt-a1i/openpi/issues/155). This document defines a boundary for a future structured result feature; the current OpenPI runtime still exposes the subagent's final text and bounded projections.

## Problem

Direct Subagents and Workflow children currently have several useful representations of one run:

- the child session and its native transcript;
- the normalized `SubagentSnapshot` in `extensions/subagents/src/domain.ts`;
- the final text shown by `subagent_wait` or automatic delivery;
- optional workflow artifacts and `structured` payloads written by `extensions/workflows/artifacts.ts`.

These representations must not silently become interchangeable. A short parent-facing message is a projection, not the canonical result, and a JSON-shaped payload is not valid merely because it parses.

## Scope

This first pass defines the vocabulary and ownership boundary for a future implementation. It does not add a new tool, change the current result schema, validate model output at runtime, or make a successful child automatically complete a parent task.

## Ownership

```text
Pi child session / transcript
        │ native execution evidence
        ▼
canonical subagent result
        │ bounded, model-facing projection
        ├── subagent_wait / automatic delivery
        └── TUI and status summaries
        │ optional durable copy
        ▼
workflow or result artifact
```

The canonical result belongs to the child run that produced it. The parent may read or project it, but must not rewrite it while summarizing. Workflow persistence may store a copy with an explicit run and agent identity; it is not a second authority for child lifecycle state.

## Proposed result shape

The following is a contract sketch, not a TypeScript API to add now:

```ts
type StructuredSubagentResult = {
  version: 1;
  id: string;
  status: "completed" | "failed" | "interrupted";
  output: string;
  structured?: unknown;
  error?: {
    code: string;
    message: string;
  };
  evidence: ReadonlyArray<{
    kind: "text" | "artifact" | "tool" | "test";
    ref: string;
    summary?: string;
  }>;
  producedAt: number;
};
```

Required rules:

- `id` identifies the child run, not a parent message or a display row.
- `status` is authoritative for settlement. `output` may be partial when the status is `failed` or `interrupted`.
- `error` describes why a non-completed run settled; it must not be inferred from an empty output.
- `structured` is optional data from the child contract. It is never assumed to be an object, trusted command, or completion proof without validation.
- `evidence` contains references or concise summaries only. It does not turn model claims into independently verified facts.
- `version` is required before a persisted or cross-boundary payload is accepted.

The exact fields may change during implementation. Adding fields must preserve the distinction between execution state, child output, and evidence.

## Canonical result versus parent projection

The canonical result is complete within its configured storage and byte budget. Parent delivery is allowed to be smaller:

- preserve `id`, `status`, and the error state;
- preserve the output head and decision/evidence tail when truncation is necessary;
- include an explicit truncation marker and a safe artifact reference when one exists;
- never report a truncated projection as the complete canonical answer;
- never replace a failed result with a successful-looking summary because a partial output exists.

TUI previews and `subagent_check` remain status projections. They may omit output entirely. `subagent_wait` and automatic delivery may include a bounded output, but should use the same projection policy rather than maintaining separate truncation semantics.

## Optional schema validation

Schema validation is a consumer-selected boundary, not a blanket requirement for every subagent:

1. The caller supplies a named schema or an equivalent validated contract.
2. The child returns a candidate `structured` value.
3. The consumer validates the candidate against that schema.
4. The result records `accepted`, `rejected`, or `not_requested` separately from execution status.

Validation must be fail-closed for consumers that require the schema. A child with valid prose but invalid structured data is still a settled child, but it is not a valid structured result for that consumer. The original output and validation error must remain inspectable; validation must not mutate the child transcript.

## Failure and partial-result semantics

The runtime must distinguish at least these outcomes:

| Outcome | Meaning | Parent action |
| --- | --- | --- |
| `completed` | The child run reached its normal terminal boundary. | May consider the result, subject to any consumer validation and independent evidence checks. |
| `failed` | The child or result boundary failed. | Preserve the error and any partial output; do not infer completion. |
| `interrupted` | The run was cancelled or stopped before normal completion. | Preserve partial output as context only; do not treat it as a final answer. |
| `rejected` | A requested structured-result validator rejected the payload. | Keep the child settled, but reject the structured contract and expose the reason. |
| `unavailable` | A canonical artifact or required result read could not be obtained. | Fail closed for consumers that require canonical data. |

`failed`, `interrupted`, and validation `rejected` are not interchangeable. A future receipt should expose execution status, validation status, canonical-storage status, and parent-delivery status independently so one successful step cannot mask another failure.

## Evidence boundary

Evidence is descriptive unless a verifier independently checks it. A result may reference:

- a bounded child output excerpt;
- a Pi session or transcript location;
- an artifact path created by the runtime;
- a tool call or test result with a stable local reference.

Model-written paths, test claims, and URLs are untrusted strings. Future consumers must verify that an artifact belongs to the expected run and stays within the allowed result area before exposing it as recovery data. Parent task completion, workflow acceptance, and issue closure remain separate decisions.

## Budget and privacy rules

- Bound output, evidence count, evidence text, and serialized structured data before model-facing delivery.
- Preserve complete data only in an explicit, permission-checked artifact; a failed optional artifact write must be visible as unavailable.
- Do not put raw tool payloads, secrets, or unbounded transcripts into the structured result by default.
- Do not let a child-provided title or path choose an artifact filename.
- If a projection is truncated, state what was omitted and how to inspect the canonical copy, when available.

## Future implementation checklist

- [ ] Choose one runtime owner for the canonical result and one stable versioned representation.
- [ ] Make direct Subagent and Workflow consumers use the same projection and receipt vocabulary.
- [ ] Add focused tests for completed, failed, interrupted, validation-rejected, and unavailable outcomes.
- [ ] Test that parent summaries cannot overwrite or upgrade child status.
- [ ] Test bounded output and artifact failure without false recovery claims.
- [ ] Decide how callers opt into schemas and how schema identity is recorded.
- [ ] Document migration for existing text-only results and existing workflow artifacts.

Until those checks exist, this contract is a design reference only. The current implementation remains the source of truth for shipped behavior.
