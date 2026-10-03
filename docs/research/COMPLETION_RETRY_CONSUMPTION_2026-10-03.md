---
status: validated
created: 2026-10-03
last-verified: 2026-10-03
applies-to: OpenPI main c7862b852d866123e2b32c79d309bd49a3cf515f and the scoped fix for issue 647
related-issues:
  - https://github.com/openpi-dev/openpi/issues/647
related-prs: []
supersedes: none
---

# Completion claims and late transport retries

## Verified facts

The shared inbox removes an envelope from `pending` when transport claims it. Before this fix, producer consumption inspected only `pending`, and `retry` unconditionally re-admitted the caller's envelopes. Consequently, `claim → consume → retry` revived a completion already returned by a status/wait path. `claim → acknowledge/clear → retry` also revived an invalidated claim. A production Background Terminal adapter regression reproduced the same duplicate after `drain → consume → restore`.

The scoped fix removes matching producer identities from both maps and permits retry only while the exact envelope still owns its in-flight slot. This also rejects an old batch after a replacement claim reuses the same delivery id. Unconsumed siblings retain their original order ahead of newly pending work. Existing owner and epoch checks still govern admission.

## Validation and limits

Three new regressions failed before the runtime change. After the change, the inbox and Background Terminal, Subagent, and Workflow delivery suites passed; a further regression covers replacement claims. Tests exercise the actual shared module and adapters without model calls, timers, or external services. Full repository gates are recorded in the linked PR.

No installed Pi, provider, or manual TUI smoke is claimed. This preserves an existing runtime consumption/cleanup invariant; it adds no tool, persisted state, configuration, or model reasoning policy. Workflow's durable per-run transport receipt recovery remains owned by its existing adapter.
