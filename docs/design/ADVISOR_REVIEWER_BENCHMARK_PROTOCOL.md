# Advisor versus Reviewer Benchmark Protocol

Status: protocol-only first pass for [issue #162](https://github.com/tt-a1i/openpi/issues/162). This document defines an experiment; it contains no benchmark result and does not propose a default runtime watcher.

## Question

Does continuous independent Advisor supervision reduce meaningful failures enough to justify its extra requests, tokens, latency, cache use, and false interruptions compared with OpenPI's current on-demand reviewer model?

The experiment must distinguish the existence of a reviewer from a reviewer observation that was actually adopted and changed the outcome.

## Arms

Run the same task corpus under four arms:

| Arm | Supervision policy |
| --- | --- |
| A — bare OpenPI | No reviewer or Advisor. The primary agent uses the normal OpenPI capabilities. |
| B — on-demand | The primary agent may explicitly spawn the read-only `reviewer` or `advisor` role when it judges that review useful. |
| C — phase-boundary | A read-only reviewer runs only at pre-registered checkpoints, such as after implementation and before final verification. |
| D — continuous Advisor | An independent Advisor receives transcript deltas and may emit a bounded concern, blocker, or no-op observation. It is opt-in for the experiment only. |

Arm D must not be simulated by adding a prompt sentence to the primary agent. If an implementation is not available, record Arm D as `not-run` rather than treating a prompt-only approximation as equivalent.

## Fixed variables

Before running a task, record and freeze:

- OpenPI and Pi revisions;
- primary and reviewer model provider/model IDs and thinking levels;
- temperature or equivalent sampling controls;
- task prompt, starting repository revision, and expected output;
- available tools, capability groups, project trust, and write permissions;
- concurrency limits and timeout policy;
- reviewer instructions and severity vocabulary;
- acceptance tests and independent verifier version.

Do not tune the task, model, or verifier after seeing an arm's result. A changed task is a new corpus entry.

## Task corpus

Use a small fixed corpus before expanding it. It must include:

1. at least one high-risk, multi-step change where early direction errors are costly;
2. at least one ordinary short change where supervision overhead is likely to dominate;
3. at least one task with a deliberately tempting but incorrect API assumption;
4. at least one task that ends in a clean rejection or blocked state rather than a code change.

Each task needs a deterministic starting revision, a task-specific verifier, and a rubric written before execution. Do not select tasks only because a reviewer is expected to help.

## Reviewer event labels

Every reviewer emission receives one label by an evaluator who can inspect the full run:

| Label | Definition |
| --- | --- |
| `empty` | No actionable observation was emitted. |
| `useful` | Correct, specific observation supported by task evidence. |
| `adopted` | The primary agent changed a later action because of the observation. |
| `ignored-useful` | Correct observation, but the primary agent did not adopt it. |
| `false-positive` | Observation was not supported or would have made the result worse. |
| `duplicate` | Repeats an already known observation without new evidence. |
| `late` | Arrived after the relevant decision or terminal boundary. |
| `unsafe` | Attempts to widen authority, perform an unapproved mutation, or expose sensitive data. |

`adopted` is a property of a useful observation plus a traceable primary-agent change, not a reviewer self-report. A blocker that merely delays a successful task is not automatically a useful intervention.

## Measures

Record the following per task and aggregate by arm:

### Quality

- independent verifier pass/fail;
- rubric score and defect count;
- security or policy violations;
- final result status: completed, failed, interrupted, or blocked;
- first useful correction phase;
- rework avoided and rework caused by supervision.

### Cost and time

- primary request count and reviewer request count;
- input/output tokens for each model;
- cache reads/writes or equivalent provider counters;
- wall-clock time to first useful result and final settlement;
- tool calls and spawned child count;
- estimated monetary cost using the recorded provider price snapshot.

### Supervision quality

- useful, adopted, ignored-useful, false-positive, duplicate, late, and unsafe counts;
- reviewer failure, timeout, cancellation, and crash counts;
- primary turns interrupted or restarted by supervision;
- observations emitted after the primary reached a terminal answer.

Never combine quality and cost into one undocumented score. Publish the raw counters and any derived ratio beside its formula.

## Run record

Each run should produce a bounded record with this shape:

```text
corpus_id:
arm:
openpi_revision:
pi_revision:
primary_model:
reviewer_model:
tool_profile:
permission_profile:
task_seed:
primary_requests:
reviewer_requests:
primary_tokens:
reviewer_tokens:
cache_events:
wall_time_ms:
verifier_status:
final_status:
reviewer_events:
adoption_events:
failure_reason:
artifact_refs:
```

Store complete transcripts and artifacts outside the model-facing summary. Attach only redacted, bounded references to a report. Missing counters are `not-recorded`, not zero.

## Analysis

Report paired outcomes by `corpus_id`, not only an overall pass rate. At minimum show:

- quality delta for B, C, and D versus A;
- extra requests, tokens, cache events, latency, and cost;
- useful/adopted intervention rate;
- false-positive, duplicate, late, unsafe, timeout, and reviewer-failure rates;
- whether the primary result changed and whether the change improved the independent verifier result;
- confidence intervals or an explicit small-sample limitation.

If Arm D is unavailable, publish the incomplete comparison and do not infer a continuous-supervision benefit. If a reviewer failure blocks the primary task, report that availability cost separately from task quality.

## Decision gate

Do not add a resident Advisor to OpenPI's default path from one successful example. A follow-up design must show:

- repeatable quality improvement on the high-risk subset;
- no unacceptable false-positive, unsafe, or late-interruption rate;
- a measured cost/latency tradeoff acceptable to users;
- a fail-open or fail-closed policy chosen explicitly for reviewer failure;
- read-only authority preserved for the reviewer;
- no second acceptance authority or competing completion truth.

If on-demand or phase-boundary review is equal or better on paired evidence, the result should explicitly recommend keeping continuous supervision out of OpenPI.

## Non-goals

- no production Advisor watcher;
- no merge gate based only on reviewer opinion;
- no model-generated score as a substitute for an independent verifier;
- no hidden task, model, permission, or cost changes between arms;
- no automatic reviewer authority to edit files or approve external side effects;
- no claim that this protocol itself proves a benefit.
