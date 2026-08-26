# Bare Pi vs Pi + OpenPI benchmark protocol

Protocol frozen: 2026-08-13

This document defines the comparison contract, trust boundary, metrics, task
ladder, and stopping rules. It is the source of truth for how a run is executed;
dated outcomes and analysis live in [`runs/`](runs/) and are indexed by
[`README.md`](README.md).

## Decision

Run the comparison, but do not reuse the old “Single vs four-role Hive” score as
evidence for OpenPI. The primary comparison must keep one top-level Pi process,
the exact task prompt, model route, thinking level, deadline, sandbox, and hidden
verifier identical. The treatment arm differs only by loading a pinned OpenPI
package with a frozen, safe configuration.

The existing HiveBench work is the best local foundation. It already contains
task snapshots, post-run private verifier injection, candidate isolation, Pi JSON
parsing, provenance, and paired reports. It is not yet ready to run full OpenPI
safely or to make equal-compute claims: most of the Pi support is uncommitted,
OpenPI children/background tools can cross the current parent-only tool boundary,
and direct subagent calls do not expose complete nested model usage to the parent
result.

Recommended order:

1. Freeze and repair the harness trust and accounting boundaries.
2. Run the three-task Aider pilot below as an integration gate.
3. Run a preregistered recent repository-task sample as the primary benchmark.
4. Report natural-use quality separately from resource efficiency.

No publishable model benchmark should be run before the P0 gates in this
document pass. A clearly labelled local exploratory pilot may run after the
starter/reference calibration, credential isolation, whole-process filesystem
containment, route canary, and process-tree cleanup gates pass. Such a pilot is
useful for deciding whether a full campaign is worth building, but it is not
headline evidence.

## 1. Question and estimand

### Primary question: package uplift under natural use

> Given the same Pi, model route, reasoning setting, task, wall-clock deadline,
> and execution environment, how does making the OpenPI package available change
> the probability that the final repository artifact passes a host-owned verifier?

| Cell property | Arm A: bare Pi | Arm B: Pi + OpenPI |
| --- | --- | --- |
| Top-level process | One Pi process | One Pi process |
| Pi build | Same pinned build | Same pinned build |
| Prompt | Same exact bytes | Same exact bytes |
| Model and thinking | Same exact route and value | Same exact route and value |
| Built-in task deadline | Same | Same |
| Starter repository | Same immutable snapshot | Same immutable snapshot |
| Candidate sandbox | Same outer containment | Same outer containment |
| Verifier | Same, injected after exit | Same, injected after exit |
| Package exposure | No OpenPI package | One pinned OpenPI package |
| OpenPI feature use | Impossible | Chosen naturally by the parent agent |

The task prompt must not mention OpenPI, workflows, subagents, parallelism, or
background terminals. This estimates the value of installing OpenPI, including
whether the model chooses its capabilities appropriately. It is deliberately not
an equal-compute estimate: OpenPI may make additional model calls.

### Secondary question: orchestration attribution

After nested telemetry and containment are complete, run a separate ablation in
which both arms have the same confined search/file/shell tools and the treatment
adds only orchestration. Do not combine this result with the primary natural-use
score.

### Feature canaries, not headline evidence

Prompts that explicitly require multiple agents, background processes, a plan, or
context handoff are useful product reliability tests. They favor OpenPI by design
and must live in a separate “feature probe” section of the report.

## 2. Frozen implementation under test

The current workspace resolves Pi as `@earendil-works/pi-coding-agent@0.84.1`.
Before a campaign, record and verify:

- Pi package name, version, tarball integrity, and source commit;
- OpenPI package version, Git commit, clean/dirty state, and packed tarball SHA-256;
- benchmark manifest SHA-256 and task-source revisions;
- provider, model, thinking level, endpoint class, and route policy;
- container or VM image digests, host architecture, and runtime versions;
- local exploratory runner, runtime-guard, and safe-snapshot helper SHA-256;
- the normalized OpenPI configuration and every loaded resource/tool source.

For the local snapshot, the resolved Pi package advertises source commit
`53fa77ccd8a279eb87e92294ef3687b03ff80112`. That is the comparison baseline;
“bare Pi” must not silently mean a different upstream release.

OpenPI configuration is part of the treatment and must be frozen. For the first
natural-use campaign use the package defaults that do not create extra model
calls before the agent asks for them:

- next-action suggestions disabled;
- post-edit command disabled;
- subagent role models inherit the parent route and thinking setting;
- no optional packages;
- workflow concurrency `8` and total-call limit `128` (the current defaults),
  both recorded explicitly;
- non-interactive/print mode, so footer and theme differences are irrelevant.

## 3. A/B isolation

Each task/arm/repeat is a fresh cell.

1. Create a clean candidate directory from the same content-addressed starter.
2. Create a unique empty `PI_CODING_AGENT_DIR` for the cell.
3. Disable sessions, history, discovered packages, skills, prompt templates, and
   context files. Load only harness-owned resources declared by the arm profile.
4. Give both arms the same scoped provider credential through the same proxy and
   route. Never expose general host credentials to candidate tools.
5. Start the deadline at the same lifecycle boundary. Package initialization in
   the treatment counts against its deadline.
6. Capture Pi JSONL and require an authoritative final `message_end` with
   `stopReason: stop`; verify the returned provider/model against the frozen arm.
7. Freeze the artifact at deadline, terminate descendants, then verify a fresh
   immutable copy outside the candidate session.

Use counterbalanced task-level order: even repeats run A then B; odd repeats run B
then A. Randomize task order with a preregistered seed. Prefer one cell at a time
to avoid route contention. If concurrency is necessary, launch complete A/B pairs
under an explicit capacity reservation and record queue time separately.

Warm-state policy must be symmetric. Either use cold caches for every cell or
prewarm identical public dependencies in the frozen image. Never prewarm only
OpenPI or retain one arm's conversation/session state.

### 2026-08-15 local runner isolation amendment

The v2 whole-process profile was not a sufficient model boundary: Pi needed the
agent directory to load credentials, so the same model-controlled Bash process
could also inspect it. A later attempt to nest a stricter `sandbox-exec` for Bash
inside the sandboxed Pi process failed with macOS code 71.

The v4 local exploratory runner instead treats Pi and the loaded extension as
trusted host code and confines the model-facing boundary:

- a symmetric benchmark extension scrubs the selected provider/model config
  before the first model request;
- built-in file tools resolve and reject paths outside the candidate, including
  symlink escapes;
- each Bash call enters a fresh network-none `sandbox-exec`; system and
  toolchain roots are read-only, while only the candidate, an empty HOME, and a
  private TMPDIR are writable;
- an unreviewed optional tool call is blocked and marks the cell invalid;
- after Pi or the verifier exits, the runner cleans and confirms its complete
  process group before reading the candidate;
- candidate snapshots reject symlinks and multi-link regular files, use
  no-follow/exclusive opens, and verify directory and file identity across the
  copy before the hidden verifier is injected;
- calibration and hidden verification still run in a separate explicit-root,
  network-none sandbox;
- the mandatory preflight and runtime guard evidence are archived with the run.

The runner records this as `candidate-tool-boundary-v4`. It is suitable for the
core-tool local smoke only. Because optional OpenPI tools fail closed, it cannot
measure capability value and is not equivalent to the preferred ephemeral VM or
container boundary.

## 4. P0 trust-boundary gate

Pi's own security documentation says it has no built-in sandbox and extensions
run with the user's permissions. A package is executable code, not a permission
boundary. The whole Pi + OpenPI process therefore needs containment, not merely a
confined parent `bash` tool.

This matters locally because OpenPI children create fresh in-process Pi sessions.
The current HiveBench Pi adapter disables built-ins for the parent and replaces
them with confined tools, but that alone does not prove the same binding for a
child. In addition, OpenPI's background-terminal tools spawn host processes, and
its `fd`/`rg` tools can accept absolute or home-relative paths. A full OpenPI arm
could otherwise receive more host access than bare Pi and invalidate both safety
and fairness.

Preferred boundary:

- run the entire cell in an ephemeral VM, microVM, or equivalently isolated
  container namespace;
- mount only the candidate workspace and a read-only package/task bundle;
- deny host filesystem, credential stores, sockets, and metadata services;
- deny general egress; provide model transport through one scoped proxy only;
- cap processes, CPU, memory, disk, and wall time; reap the full process tree;
- run the verifier later in a different network-none environment.

If the first pilot keeps HiveBench's per-tool Docker design, the harness must also
prove that the same confined tools load in parent and child sessions, and must
exclude or safe-wrap `bg_*`, `fd`, and `rg`. This is a temporary pilot boundary,
not evidence that package code itself is sandboxed.

Before every campaign, run parent and child canaries for:

- absolute paths, `..` traversal, `$HOME`, and files outside the candidate root;
- symlink, hardlink, FIFO, socket, and device access;
- host environment variables, credentials, and Unix sockets;
- general network and metadata endpoints;
- detached/background processes surviving the cell;
- a legitimate read, declared edit, test command, and persisted artifact.

Any escape, different parent/child binding, or surviving process aborts the
campaign. All affected rows are invalid; do not classify them as model failures.

## 5. Task ladder

### T0: deterministic harness fixtures

Use HiveBench's fake and tracer manifests once per harness build to validate cell
creation, A/B ordering, artifact capture, failure classification, resume logic,
and report generation. They are plumbing tests and receive no capability score.

Relevant assets:

- `<hivebench-checkout>/benchmarks/local-fake.yaml`
- `<hivebench-checkout>/benchmarks/aider-polyglot-smoke.yaml`
- `<hivebench-checkout>/benchmarks/aider-polyglot-comparative-tracer.yaml`

### T1: three-task multilingual pilot

Reuse three already-frozen Aider/Exercism cells from
`<hivebench-checkout>/benchmarks/aider-polyglot-pi-pilot.yaml`:

| Task id | Language | Existing source |
| --- | --- | --- |
| `python-bottle-song` | Python | `benchmarks/aider-polyglot-pi-pilot.yaml` |
| `javascript-connect` | JavaScript | `benchmarks/aider-polyglot-pi-pilot.yaml` |
| `rust-nucleotide-codons` | Rust | `benchmarks/aider-polyglot-pi-pilot.yaml` |

These span three locally available toolchains while keeping the integration
pilot small. Go was installed before the 2026-08-13 Luna/max campaign, so that
campaign added the preregistered `go-book-store` cell before either arm ran.
Run at least three repeats per arm for regression decisions; a two-repeat
campaign remains exploratory. The pilot answers only whether the
two profiles can complete, remain contained, produce accountable telemetry, and
reach the same hidden verifier. It is underpowered and dominated by small coding
exercises; do not call its pass delta a general OpenPI uplift.

The full six-task manifest may later serve as a multilingual regression set:
C++ `parallel-letter-frequency`, Go `book-store`, Java `bank-account`, JavaScript
`connect`, Python `bottle-song`, and Rust `nucleotide-codons`.

### T2: primary repository-task benchmark

Use a recent frozen slice of
[SWE-bench-Live/MultiLang](https://github.com/microsoft/swe-bench-live), not a
hand-picked set of tasks that obviously benefit from delegation. Suggested first
internal campaign: 30 tasks × 2 arms × 3 repeats = 180 cells.

Pre-register the dataset revision, task IDs, selection seed, and stratification.
Stratify by language, repository, failing-test count, number of files in the
reference patch, and a precomputed complexity bucket. Include both compact fixes
and multi-file diagnosis/implementation work. Cap tasks per repository so one
codebase cannot dominate the estimate.

The selection program may use reference metadata, but the candidate must never
receive the gold patch or hidden test patch. Selection must be frozen before any
arm result is observed.

Use a small
[SWE-bench Verified](https://www.swebench.com/verified.html) slice only as a
compatibility signal. OpenAI now warns that the public Verified set is
increasingly contaminated and saturated, so it should not be the primary evidence
for a 2026 product claim.

### T3: OpenPI feature probes

Create separate, clearly labeled scenarios for:

- independent parallel investigations with a mergeable final artifact;
- cross-file implementation, tests, and review;
- a bounded long-running background command;
- a long task that exercises plan/resume/context handoff.

These tasks may explain *how* OpenPI works and expose reliability bugs. Because
they are authored around OpenPI affordances, never pool them with neutral T1/T2
pass rates.

## 6. Hidden acceptance

Candidate-visible input contains only the issue/task text, starter repository,
and public build metadata needed for ordinary development. It excludes:

- gold/reference patches;
- hidden test patches and expected outputs;
- verifier scripts, task-selection metadata, and result labels;
- artifacts or conversations from another arm or repeat.

After the agent exits or the deadline fires:

1. Freeze the submitted repository hash and preserve the raw artifact.
2. Copy it into a fresh verifier workspace.
3. Inject the pinned verifier files with exclusive/no-follow semantics.
4. Run exactly one host-owned verification in a network-none image.
5. Store exit code, bounded logs, image digest, and verifier hash.
6. Remove verifier files before exposing any artifact to subsequent cells.

Before scoring, prove that each starter fails the required acceptance test and
that the pinned reference patch passes it twice in the final image. Exclude an
unreliable task before the campaign. Once scoring begins, never reveal verifier
feedback, repair an artifact, or selectively retry a failed arm.

For repository tasks, allow ordinary repository-wide candidate edits while
protecting `.git`, harness controls, and verifier material. An allowlist derived
from gold-patch paths leaks task structure and blocks legitimate alternative
solutions.

“Hidden during the run” does not mean uncontaminated. Aider and SWE-bench tasks
are public. Report dataset age and contamination risk separately from the strong
claim that the verifier was unavailable to this run.

## 7. Metrics and accounting

### Primary metric

Artifact pass@1 at the fixed deadline, with every assigned task/arm/repeat in the
denominator (intent to treat). A process saying “done” is not success.

Report task-paired A-vs-B win/loss/tie and the paired pass-rate difference. Keep
these statuses disjoint:

- `passed`: frozen artifact passed the one hidden verifier;
- `task_failed`: run completed but artifact failed;
- `budget_exhausted`: declared wall/token/call budget stopped the cell;
- `infra_failed`: route, process, sandbox, harness, or verifier infrastructure
  failed.

The headline intent-to-treat table must retain `budget_exhausted` and
`infra_failed`. A separate artifact-only diagnostic may exclude confirmed
infrastructure failures, but it cannot replace the headline result.

### Required secondary metrics

- wall time and queue time;
- time to first durable edit;
- parent turns and tool calls;
- total model invocations across parent and every child;
- total input, output, cache, and reasoning tokens across the whole process tree;
- sum of agent-seconds and peak model-call concurrency;
- exact cost when provider accounting is trustworthy, otherwise `unknown`;
- child spawn/completion/failure/cancel counts and workflow call count;
- files changed, diff lines, generated-test count, and test commands;
- unsafe access attempts and safety-canary outcome;
- verifier calls, which must be one per scored cell;
- whether each OpenPI capability was actually used.

Current direct OpenPI subagent results do not provide a trustworthy cumulative
child-usage total to the parent record. Until this is fixed, nested tokens, cost,
and agent time must be `unknown`, not zero. The benchmark may still make a
natural-use artifact-quality claim, but not an efficiency or equal-compute claim.

Add an equal-resource block only after all nested calls are measured and the
harness can enforce the same predeclared model-call/token/agent-minute budget in
both arms. Report it separately from the natural-use block.

### Statistical summary

Treat the task, not an individual repeat, as the independent unit. Estimate the
paired pass delta with a task-cluster bootstrap 95% confidence interval and a
paired permutation/sign test. Do not inflate sample size by treating repeats of
the same task as unrelated tasks.

Pre-register a practical margin, suggested `δ = 5` percentage points:

- benefit: lower 95% confidence bound is greater than `+δ`;
- non-inferior but not proven better: lower bound is greater than `-δ`, while the
  benefit rule is not met;
- harm: upper bound is less than `-δ`;
- otherwise: inconclusive.

A 30-task internal campaign is directional and likely has wide intervals. Publish
the interval and raw task pairs rather than replacing uncertainty with a binary
winner label.

## 8. Repeats and stopping rules

- T0: once per harness build and environment image.
- T1: three repeats per arm, counterbalanced A/B order.
- T2: three repeats per arm for the preregistered 30-task sample.
- T3: at least three repeats, reported only as feature reliability.

Do not stop early for apparent benefit or harm and do not peek to choose more
tasks. No selective retry, rescue prompt, verifier-feedback repair, or model
substitution is allowed. A deterministic total cost/time cap may end an
exploratory campaign, but the truncated result is not a definitive comparison.

Abort and restart the entire affected block only when one of these predeclared
conditions fires:

- any safety canary fails or a descendant survives containment;
- actual provider/model/thinking differs from the frozen route;
- reference calibration or verifier determinism fails;
- task bytes, package hash, sandbox image, or scoring code drift mid-block;
- infrastructure failures exceed 5% of assigned cells in either arm.

Preserve all partial rows and state the abort reason. After repair, use a new
campaign ID and rerun the complete affected block rather than only failed cells.

## 9. Reusable local assets

### HiveBench: reuse after freezing

Operator-local checkout: `<hivebench-checkout>`

| Asset | Value for this benchmark | Qualification |
| --- | --- | --- |
| `src/runner/manifest.ts` | Typed task/control manifest | Extend with arm profiles; do not encode package exposure as “strategy” |
| `src/runner/task-sandbox.ts` | Per-cell candidate directories | Reuse |
| `src/runner/private-verifier-files.ts` | Post-run exclusive verifier injection | Reuse |
| `src/runner/campaign-cell.ts` | Run then verify lifecycle | Reuse after full-process containment |
| `src/runner/verifier.ts` | Host-owned verifier | Reuse |
| `src/safety/*` | Path, environment, Docker, subprocess guards | Reuse and add parent/child/background canaries |
| `src/adapters/pi-cli.ts` | Non-interactive Pi invocation | Generalize to `bare_pi` and `pi_openpi` profiles |
| `src/adapters/pi-json.ts` | Final-event, model, and usage validation | Reuse; add nested usage provenance |
| `benchmarks/pi/hivebench-sandbox-tools.ts` | Confined file/shell tools | Useful for pilot, insufficient as the only package boundary |
| `src/runner/result-writer.ts`, `run-metadata.ts`, `report.ts` | Raw JSONL, provenance, paired reports | Reuse; add task-cluster statistics and arm/package hashes |
| `docs/pi-benchmark-protocol.md` | Counterbalancing, calibration, failure taxonomy | Adapt |

At inspection time the HiveBench checkout is at commit
`c10ea941f4de008d144b557aa055b31db4f62a62`, but the Pi manifests, adapter,
sandbox extension, scripts, docs, and many tests are modified or untracked. Treat
this checkout as a valuable incubator, not a reproducible dependency. Commit or
export a content-addressed clean snapshot before citing a result.

### HiveBench assets that are not fair evidence as-is

`benchmarks/aider-polyglot-pi-sonnet5-comparative.yaml` compares a one-process
`single_strong` arm with a forced four-role `hive_role_team`. It also gives the
single arm a 900-second timeout and the Hive arm 420 seconds. That answers a
different question and creates unequal resources. Its six mostly small exercises
also tend to punish coordination overhead. Reuse its frozen task/verifier bytes,
not its arm semantics or old score.

`benchmarks/aider-polyglot-comparative-tracer.yaml` is deterministic plumbing,
not model evidence. `benchmarks/local-fake.yaml` is likewise a smoke fixture.

### Hive private runtime: do not use as the neutral host

Operator-local checkout: `<private-hive-runtime-checkout>`

No independent coding-agent task harness, frozen task suite, or host-private
acceptance corpus was found. Its runtime/protocol tests validate Hive itself.
Using the runtime as both experiment host and treatment-like orchestration layer
would bias the comparison. Reuse only generic telemetry ideas, not its controller
or product-specific success contract.

### Hive Work: reuse verifier concepts, not the runner

Operator-local checkout: `<hive-work-checkout>`

- `scripts/check-open-source-benchmarks.mjs` and
  `docs/benchmarks/open-source-agent-workbench.json` track open-source product
  evidence/freshness; they do not execute coding tasks.
- `src/main/autonomous-verifier.ts` and `scripts/check-autonomous-task-*.mjs`
  contain useful command-verifier, redaction, and failure-taxonomy patterns.
- The autonomous controller is product-specific and should not host this A/B
  comparison.

### OpenPI's own tests

OpenPI unit/integration tests are necessary regression gates but not an external
benchmark. Tasks derived from its tools or documentation belong in T3 and must
not contribute to the neutral pass-rate estimate.

## 10. Required harness delta before execution

1. Freeze the current HiveBench work into a clean revision or exported bundle.
2. Replace `strategy`-shaped Pi comparison with explicit `arm_id`/package profiles:
   `bare_pi` and `pi_openpi`.
3. Add per-cell isolated agent directories and record the complete resource/tool
   load graph for parent and child sessions.
4. Put the full OpenPI process tree behind the outer boundary; add the canaries in
   Section 4.
5. Aggregate usage, model identity, elapsed agent time, and termination state from
   every child/workflow call.
6. Add a SWE-bench-Live adapter with repo-wide candidate writes and official
   post-run evaluation.
7. Add intent-to-treat paired reporting, task-cluster intervals, fixed stop rules,
   and raw artifact links.
8. Validate T0 and reference calibration before spending on T1.

## 11. Bias checklist

### Choices that favor OpenPI

- telling the treatment to use subagents/workflows while giving bare Pi no
  equivalent instruction;
- selecting only highly parallel/decomposable tasks or tasks authored from OpenPI
  features;
- giving OpenPI a different model, deadline, verifier feedback, network, writable
  surface, or host access;
- ignoring child tokens, calls, agent-minutes, failures, or orphan processes;
- excluding OpenPI protocol/infra failures from the denominator;
- retrying only treatment failures or keeping treatment sessions/caches warm;
- scoring plans, self-reported completion, or dispatch evidence instead of the
  artifact;
- allowing the treatment's child tools to bypass the bare arm's sandbox.

### Choices that favor bare Pi

- using only tiny single-file exercises where orchestration overhead dominates;
- forcing OpenPI to launch a fixed four-agent team on every task;
- giving OpenPI a shorter timeout or starting its clock earlier;
- disabling the exact child/search/background capabilities whose natural value is
  under test without labeling the result a constrained ablation;
- counting only parent tokens for OpenPI while interpreting the number as total
  compute;
- using a gold-path-derived writable allowlist that blocks alternative multi-file
  fixes.

## 12. Evidence sources

Primary sources used to define the protocol:

- Pi usage and non-interactive controls:
  [usage.md at the resolved Pi source commit](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/docs/usage.md)
- Pi package loading and package privileges:
  [packages.md at the resolved Pi source commit](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/docs/packages.md)
- Pi JSONL event contract:
  [json.md at the resolved Pi source commit](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/docs/json.md)
- Pi security boundary:
  [security.md at the resolved Pi source commit](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/docs/security.md)
- Aider's official benchmark procedure and Docker warning:
  [benchmark README at the pinned verifier commit](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/benchmark/README.md)
- Frozen Aider/Exercism task corpus:
  [polyglot-benchmark at the pinned dataset commit](https://github.com/Aider-AI/polyglot-benchmark/tree/7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f)
- SWE-bench official evaluation harness:
  [SWE-bench repository](https://github.com/SWE-bench/SWE-bench) and
  [harness reference](https://www.swebench.com/SWE-bench/reference/harness/)
- SWE-bench Verified construction:
  [official Verified page](https://www.swebench.com/verified.html)
- Current contamination/saturation limitation:
  [OpenAI: Why we no longer evaluate SWE-bench Verified](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)
- Continuously refreshed repository-task source:
  [Microsoft SWE-bench-Live](https://github.com/microsoft/swe-bench-live)

## 13. Minimum go/no-go checklist

A three-task pilot is allowed only when every item is `yes`:

- [ ] Bare Pi and Pi + OpenPI resolve the same Pi/model/thinking route.
- [ ] Package, task, image, prompt, verifier, runner, guard, and snapshot hashes are frozen.
- [ ] Parent and OpenPI child tool-source provenance is recorded.
- [ ] Parent/child/background security canaries pass.
- [ ] Nested usage is either complete or explicitly reported `unknown`.
- [ ] Starter-fails/reference-passes calibration succeeds twice per task.
- [ ] A/B order, repeats, stop rules, and report schema are preregistered.
- [ ] Raw JSONL, artifact, verifier output, and run metadata will be retained.

If any answer is `no`, run only T0 deterministic fixtures and fix the harness.
