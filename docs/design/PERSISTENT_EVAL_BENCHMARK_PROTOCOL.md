# Persistent Eval and Tool Bridge Benchmark Protocol

Status: protocol-only first pass for [issue #164](https://github.com/tt-a1i/openpi/issues/164). This document defines a paired experiment; it contains no benchmark result and does not add a persistent Eval Kernel, Tool Bridge, or code-execution dependency.

## Question

For which tasks, if any, does persistent computation reduce model/tool overhead or failure rate compared with one-shot shell execution, and does a Tool Bridge add enough value to justify its larger authority surface?

Persistent state, structured output, and tool re-entry are separate capabilities. They must not be measured as one feature.

## Arms

Run the same task corpus under these arms:

| Arm | Capability |
| --- | --- |
| A — one-shot | Existing Pi/OpenPI shell or read-only tools; every computation starts from a fresh process. |
| B — persistent compute | A session-owned JS or Python kernel with state retained between cells, but no Tool Bridge. |
| C — restricted bridge | The same persistent kernel plus a small, explicitly allowed read-only bridge to selected OpenPI tools. |

Arm B or C is `not-run` when a real, isolated kernel is unavailable. A prompt that asks the model to pretend variables persist is not evidence for persistent execution.

## Task corpus

Pre-register a small fixed corpus containing:

1. multi-turn aggregation over a large JSON/JSONL input;
2. extraction and comparison across multiple files;
3. structured configuration validation;
4. a small algorithm or parser debugging task;
5. a task where one cell should reuse an intermediate value;
6. a task where one-shot shell is already the simplest solution;
7. a task that would benefit from a read-only Tool Bridge, if any;
8. a case with invalid input, timeout, reset, or partial output.

Each case needs a deterministic input, expected output, independent verifier, maximum runtime, and expected cleanup state. Include tasks where persistent state could become stale or misleading.

## Fixed variables

Record and freeze before each run:

- OpenPI, Pi, kernel, interpreter, and bridge revisions;
- primary and kernel/bridge model provider/model IDs and thinking levels;
- task prompt, starting workspace revision, operating system, Node/Bun/Python versions;
- file, process, network, environment, and project-trust permissions;
- cell, output, memory, wall-clock, recursion, and Tool Bridge limits;
- warm/cold start policy, reset policy, retry policy, and random seed;
- verifier version and provider price snapshot.

Do not tune the task or limits after seeing another arm. A changed kernel profile is a new arm.

## Lifecycle contract under test

Every persistent runtime must be owned by one Pi Session, workspace identity, language, and generation:

```text
requested → starting → ready → running → idle
                         ├→ reset
                         ├→ failed
                         ├→ timed_out
                         ├→ cancelled
                         └→ closed
```

The benchmark must observe:

- state retention across cells;
- reset and Session switch behavior;
- timeout and cancellation behavior;
- interpreter crash and restart policy;
- shutdown cleanup and process ownership;
- stale-state detection after workspace or branch changes;
- whether an uncertain kernel is destroyed rather than silently reused.

The kernel must not outlive its owning Session. A failed cleanup is a measured failure, not an invisible test harness detail.

## Tool Bridge boundary

The bridge is an independent variable. If included, it must be:

- explicitly activated and listed in the run record;
- read-only in the first experiment;
- limited to named tools, workspace scope, output bytes, and call count;
- unable to call arbitrary shell, network, import, delegation, or mutation operations;
- attributed to the parent Session and kernel generation;
- cancelled and cleaned up with the cell and Session;
- fail-closed when a tool result is stale, malformed, truncated, or outside scope.

Do not infer that a kernel can call all normal Pi tools because one bridge call works. Bridge failure must not silently downgrade to a broader shell or parent authority.

## Output and state evidence

Each cell result must distinguish:

```text
cell_status: completed | failed | timed_out | cancelled | reset | unavailable
output_status: complete | partial | unavailable
state_generation:
bridge_status: not_requested | completed | failed | unavailable
artifact_refs:
```

An empty output is not proof of successful execution. A truncated table or stale variable is not a complete result. Full state and output stay outside the model-facing summary unless the experiment explicitly requests a bounded projection.

## Run record

Record per task and arm:

```text
corpus_id:
arm:
openpi_revision:
runtime_versions:
primary_model:
kernel:
bridge_profile:
permission_profile:
cell_count:
process_count:
tool_calls:
primary_tokens:
kernel_tokens:
wall_time_ms:
cold_start_ms:
warm_cell_ms:
parse_or_stdout_errors:
state_resets:
timeouts:
cancellations:
cleanup_status:
verifier_status:
side_effects:
artifact_refs:
```

Missing counters are `not-recorded`, not zero. Redact secrets, environment values, raw source, and credentials before publishing records.

## Measures

### Quality

- independent verifier pass/fail;
- output correctness and reproducibility;
- state contamination or stale-result defects;
- structured-output parse failures;
- partial-result interpretation;
- permission or unauthorized-side-effect violations.

### Cost and latency

- primary requests and tokens;
- kernel cell count and warm/cold startup time;
- bridge calls and bridge output bytes;
- wall-clock time and estimated cost;
- process and memory footprint when measurable.

### Reliability

- timeout, cancellation, reset, crash, and interpreter failure;
- cleanup and process leak status;
- error recovery and retry count;
- kernel reuse after an uncertain state;
- failure rate by arm and corpus class.

Do not combine quality and cost into an unexplained score. Publish paired raw counters and formula-defined derived values.

## Decision gate

Do not add a persistent kernel or Tool Bridge to the default capability surface from one successful task. A follow-up implementation must show:

- repeatable quality or cost improvement for a defined task class;
- no unacceptable permission, state-contamination, cleanup, or external-side-effect failures;
- bounded cold/warm latency and model-visible output;
- explicit owner, reset, timeout, cancellation, and shutdown semantics;
- evidence that one-shot tools cannot achieve the same result with lower complexity;
- a separate decision for persistent compute and Tool Bridge.

If Arm A is equal or better, record that result as evidence against adding the corresponding capability. If B helps but C does not, keep the bridge out of scope.

## Non-goals

- no four-language runtime in the first implementation;
- no arbitrary `eval`, import, network, or shell authority;
- no Tool Bridge by implication;
- no automatic persistent state in ordinary turns;
- no child sharing of a parent kernel by default;
- no model-generated success claim without an independent verifier;
- no benchmark result claimed by this protocol.

Until a real isolated runtime and independent verifier are available, this document is a research contract and the existing one-shot tools remain the supported path.
