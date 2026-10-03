---
status: validated
created: 2026-10-03
last-verified: 2026-10-03
applies-to: OpenPI main c7862b852d866123e2b32c79d309bd49a3cf515f and the scoped fix for issue 648
related-issues:
  - https://github.com/openpi-dev/openpi/issues/648
related-prs: []
supersedes: none
---

# Literal replacement characters in bounded Workflow text

## Verified facts

`projectText` supplies bounded model-visible Workflow handoffs, completion reports, and prompt context. For an oversized first line, its head fallback encoded the input as UTF-8, decoded candidate prefixes, and backed up while the decoded prefix ended with U+FFFD (`�`). Literal U+FFFD is valid Unicode, so a run of those characters could erase the whole head even when many complete characters fit the budget.

The regression `projectText("�".repeat(1000) + "-END", { maxBytes: 64, maxLines: 3, recovery: "kept in artifacts" })` produced only the omission marker and tail before the fix. The fix inspects continuation bytes at the cut, backing up only to a complete UTF-8 boundary. It follows the existing Subagent artifact prefix mechanism and removes repeated decoding of progressively shorter prefixes.

## Validation and limits

The shared projector regression failed before the change and passed afterward across compact and regular projections. A production Workflow handoff registry regression covers the default 16 KiB conclusion limit and rendered handoff. Existing encoding/newline/budget cases remain in place. Full repository checks and tests are recorded in the linked PR.

This result concerns source-level projection fidelity and bounds. No installed Pi, provider, manual TUI, performance benchmark, or deployment is claimed. Exact persisted results and recovery references are unchanged. This adds no configuration, tool, model policy, or Web behavior.
