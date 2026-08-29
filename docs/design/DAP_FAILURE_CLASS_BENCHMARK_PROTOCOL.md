# DAP Failure-Class Benchmark Protocol

Status: protocol-only first pass for [issue #168](https://github.com/tt-a1i/openpi/issues/168). This document defines a comparison experiment; it contains no experimental result and does not add a DAP client, debugger dependency, or production debugger runtime.

## Question

For which failure classes, if any, does an on-demand Debug Adapter Protocol (DAP) session diagnose problems better or faster than the existing logs and tests, after accounting for setup time, token use, debugger failures, and side-effect risk?

The experiment must compare a real debugger path with a real logs/tests path. A prompt that says “pretend to use a debugger” is not a DAP arm.

## Arms

Run the same task under these arms:

| Arm | Diagnostic capability |
| --- | --- |
| A — logs and tests | Existing repository logs, targeted test runs, read-only inspection, and ordinary OpenPI tools. |
| B — on-demand DAP | A separately authorized DAP session is available only when the task requests it; it is not resident in ordinary turns. |
| C — combined | The task may use the existing logs/tests first and request DAP at a pre-registered escalation point. |

If no supported DAP server/client can be installed and run in the test environment, mark B and C `not-run`. Do not treat a static design or a debugger-like prompt as evidence for DAP.

## Failure corpus

Pre-register a small corpus that exercises distinct failure classes rather than only easy bugs:

1. deterministic wrong output with a narrow unit-test assertion;
2. wrong state after a multi-step transition;
3. cancellation or timeout race;
4. duplicate or lost event under concurrent execution;
5. malformed tool/provider response;
6. resource leak or incomplete cleanup;
7. path/permission boundary rejection;
8. intermittent failure with a pinned seed or repeated trigger;
9. performance regression with a measurable baseline;
10. a case where logs and tests are sufficient and DAP should add no value.

Every case needs a fixed starting revision, a user-visible symptom, a verifier, an expected diagnosis rubric, and a maximum safe runtime. The corpus must include both bugs that expose local state and bugs that are better explained by a trace or invariant.

## Fixed variables

Record and freeze before a run:

- OpenPI, Pi, DAP client, and adapter revisions;
- primary and debugger model provider/model IDs and thinking levels;
- task prompt, repository revision, operating system, Node/Bun versions;
- available tools, project trust, file/process permissions, and network policy;
- logging level, test command, breakpoints/watch expressions, and timeout limits;
- retry policy, repetition count, random seed, and independent verifier;
- whether the DAP session starts cold or reuses a permitted session.

Do not tune logging, breakpoints, task wording, or the success rubric after seeing another arm. A changed setup is a new run.

## Diagnostic event record

Each run should record bounded structured data:

```text
corpus_id:
arm:
openpi_revision:
runtime_versions:
primary_model:
debugger_model:
permission_profile:
reproduction_count:
failure_reproduced:
first_signal_ms:
first_localized_hypothesis_ms:
correct_root_cause:
verifier_status:
primary_requests:
debugger_requests:
primary_tokens:
debugger_tokens:
tool_calls:
wall_time_ms:
dap_start_ms:
dap_failures:
false_leads:
unsafe_or_external_side_effects:
cleanup_status:
artifact_refs:
```

Missing data is `not-recorded`, not zero. A run that never reproduces the symptom cannot receive a successful diagnosis score merely because it ends without an error.

## Diagnosis rubric

Score each arm against the pre-registered rubric:

- `reproduced`: the user-visible symptom was reproduced or the inability to reproduce was correctly explained;
- `localized`: the diagnosis identifies the responsible module, state transition, or boundary;
- `mechanism`: the causal path is supported by observation rather than correlation;
- `fixed`: the proposed fix passes the independent verifier and does not regress adjacent behavior;
- `bounded`: the investigation stays within its authority, time, output, and side-effect limits.

Record partial progress separately. “Found a suspicious line” is not the same as a correct root cause. A DAP watch value is evidence, not proof that a fix is safe.

## DAP-specific safety contract

The DAP arm is on-demand and must remain narrower than a general execution bridge:

- start only after explicit capability authorization;
- bind to one validated workspace and process/session identity;
- default to read-only inspection and bounded stack, scope, variable, and source projections;
- do not evaluate arbitrary expressions, mutate memory, write files, or run commands unless a separate write policy explicitly allows it;
- cap breakpoints, frames, variables, source bytes, events, and session lifetime;
- cancel and dispose the adapter on timeout, failure, and parent Session shutdown;
- fail closed on unknown process, stale frame, missing source, permission failure, or adapter crash;
- keep credentials, environment variables, raw protocol traffic, and unbounded source out of model-visible output.

A debugger failure must not cancel the primary task or be reported as a diagnosis. Record `adapter_unavailable`, `handshake_failed`, `request_failed`, `timed_out`, `cancelled`, and `cleanup_failed` distinctly.

## Logs/tests baseline rules

Arm A must use the same bounded-output and redaction policy as ordinary OpenPI work. It may add temporary tagged diagnostics only within the experiment and must remove them before the run is accepted.

The baseline must include:

- the exact test command and selected test files;
- log level and diagnostic prefixes;
- reproduction count and timing;
- the same independent verifier used by the DAP arm;
- a record of what could not be observed without a debugger.

A baseline that runs a broad suite but never asserts the user symptom is not a red-capable feedback loop.

## Analysis

Compare paired outcomes by `corpus_id` and failure class. Report separately:

- reproduction and correct-root-cause rates;
- time to first useful signal and verified localization;
- fix pass rate and regression count;
- false leads, repeated probes, and unresolved cases;
- primary/debugger requests, tokens, tool calls, startup time, wall time, and cost;
- adapter startup, timeout, crash, cancellation, and cleanup failures;
- unauthorized reads, writes, process actions, or external side effects;
- cases where logs/tests were already sufficient.

Do not collapse diagnosis quality and overhead into one unexplained score. Publish raw counters and formula-defined derived ratios. Small samples must be labelled as such.

## Decision gate

Do not add DAP to the default capability surface from one successful debugging session. A follow-up implementation must show:

- repeatable improvement in correct localization for a defined failure class;
- no unacceptable authority, privacy, cleanup, or external-side-effect failures;
- measured startup and token overhead acceptable for on-demand use;
- a clear policy for adapter failure and stale process/frame state;
- a read-only default with explicit escalation for any mutation;
- evidence that the same result cannot be obtained more cheaply with a targeted test or log.

If Arm A or C is equal or better for the corpus, record that result as evidence against introducing a resident DAP runtime.

## Non-goals

- no production debugger dependency;
- no always-on process attachment;
- no arbitrary expression evaluation or tool bridge by implication;
- no debugger opinion as a merge or acceptance gate;
- no unredacted transcript/protocol dump;
- no benchmark result claimed by this protocol.

Until a real DAP arm and the independent verifier are available, this document remains a research contract and logs/tests remain the supported debugging path.
