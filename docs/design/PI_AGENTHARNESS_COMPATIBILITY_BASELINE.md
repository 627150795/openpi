# Pi AgentHarness Compatibility Baseline

Status: Phase 0 design and verification contract for [issue #181](https://github.com/tt-a1i/openpi/issues/181). This document tracks compatibility work; it does not migrate OpenPI to AgentHarness or claim that the full roadmap is complete.

## Purpose

OpenPI uses Pi's Coding Agent session lifecycle as its runtime boundary. The relevant production path currently uses `createAgentSession()`, `SessionManager`, session events, and Pi extension hooks. Pi also exposes the newer AgentHarness path, but the existence of a similarly named primitive is not evidence that it can replace OpenPI's current lifecycle safely.

The first useful deliverable is a repeatable baseline for the locked version, the latest released version, and an optional upstream canary.

## Version matrix

| Track | Version or ref | Source of truth | Status |
| --- | --- | --- | --- |
| OpenPI source | `main` at `fc4ab47fba2ab43dcdb6182522fc407688b5397f` | OpenPI upstream | Recorded for this baseline. |
| OpenPI package | `0.4.0` | `package.json` | Recorded. |
| Locked Pi packages | `@earendil-works/pi-*@0.84.1` | `bun.lock` | Current development baseline. |
| Latest Pi release | `v0.84.4` | [Pi release tag](https://github.com/earendil-works/pi/releases/tag/v0.84.4) | Recorded on 2026-08-29; compatibility execution remains to be run. |
| Upstream canary | Pi `main` | Pi upstream | Informational only; never a supported release until pinned and tested. |

The matrix must record both the version tested and the result. A package range such as `^0.84.1` is not a test result, and a successful locked-version run does not establish compatibility with the latest release.

## Smoke scenario

Run the same scenario for each supported track, in a clean checkout with the stated dependency resolution:

1. Start Pi with the OpenPI extensions loaded.
2. Start a trusted session and verify that the default OpenPI tool surface is unchanged until a capability is requested.
3. Load the `delegate` capability explicitly.
4. Create one read-only child session through the normal OpenPI path.
5. Execute one bounded read-only operation and observe the normalized child events.
6. Wait for settlement and verify that the result has a status, bounded output, and no duplicate delivery.
7. Cancel a second child before settlement and verify the interrupted/cleanup path.
8. Close the parent session and verify that child resources and temporary worktrees are reclaimed.

The smoke is successful only when all steps have observable evidence. “The process did not crash” is insufficient: tool visibility, child identity, settlement, cancellation, result delivery, and cleanup are separate assertions.

## Evidence record

Each run should record:

```text
openpi_revision:
pi_track:
node_version:
bun_version:
install_lock:
session_start:
capability_load:
child_start:
tool_result:
child_settlement:
cancel_result:
cleanup_result:
failures:
artifact_paths:
```

Use `not-run`, `pass`, `fail`, or `blocked` for each assertion. A missing check is not a pass. Keep output bounded and redact credentials or provider configuration before attaching it to an Issue or PR.

## Compatibility ownership

Pi remains the source of truth for:

- provider and model selection;
- `AgentSession` and `SessionManager` lifecycle;
- session files, branch entries, and resume behavior;
- extension registration and lifecycle hooks;
- ordinary tools, Skills, and project trust.

OpenPI remains responsible for its product-level contracts:

- capability discovery and stable tool projection;
- child tool policy and authority narrowing;
- worktree isolation and cleanup;
- subagent result delivery;
- Workflow state, artifacts, acceptance, and background completion delivery.

An AgentHarness experiment must show which specific invariant moves to Pi and which OpenPI contract remains. Similar names such as “lane”, “operation”, or “durable session” do not establish semantic equivalence.

## Harness spike gate

Only after a supported Pi track passes the ordinary smoke should a separate, isolated Harness spike test:

- one in-memory child turn;
- tool registration and capability narrowing;
- model and thinking selection;
- events, cancellation, and resource cleanup;
- session persistence, recovery, fork, and tool-effect policy;
- headless extension lifecycle;
- complexity and test-count comparison with the existing `createAgentSession` path.

The spike must not replace the production path or rewrite session files. It is useful only if it deletes OpenPI complexity without weakening behavior, safety, recovery, or observability.

## Future checklist

- [ ] Execute and attach the locked `0.84.1` smoke result.
- [ ] Install and execute the same scenario against the latest supported Pi release.
- [ ] Decide and document whether `0.84.4` is supported, blocked, or requires a follow-up compatibility fix.
- [ ] Add an upstream-main canary only as an explicitly unsupported signal.
- [ ] Split any concrete incompatibility into its own implementation Issue.
- [ ] Create a separate Harness spike only after the ordinary matrix is green.
- [ ] Do not change the production session path until the spike has a rollback and migration story.

Until these checks produce evidence, OpenPI should keep the current Pi session path and treat AgentHarness as an upstream compatibility topic rather than a migration target.
