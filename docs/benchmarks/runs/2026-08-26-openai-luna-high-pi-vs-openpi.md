---
status: validated
created: 2026-08-26
last-verified: 2026-08-26
applies-to: OpenPI commit 2a69d3f32994da4123f1312b7fa84ef3d6119be1
related-issues: "#197, #198"
related-prs: "#199"
supersedes: none
provider-model: openai-codex/gpt-5.6-luna
thinking: high
task-source: frozen local polyglot benchmark manifest at commit 7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f
verifier: hidden programmatic verifier injected after agent exit
isolation: paired isolated cwd with post-exit verifier injection; provider credentials scrubbed before evidence capture
failure-classification: artifact, protocol, infrastructure, provider, and verifier outcomes are reported separately
sample-size: 5 tasks x 3 repeats x 2 arms x 2 discovery modes = 60 formal cells
evidence-manifest: ../evidence/2026-08-26-openai-luna-high-manifest.sha256
raw-evidence: operator-local archive ref openpi-luna-high-2026-08-26; not bulk-published
archive-files: 610
archive-logical-bytes: 23356879
archive-manifest-sha256: 985bb48c919455b87638803daee1e201205353b4f07e7889c76bb557570bc1b7
---

# OpenAI GPT-5.6 Luna high: Bare Pi vs OpenPI

## Scope and conclusion

This is a controlled product experiment, not a public leaderboard submission. It compares a bare Pi session with Pi plus a pinned OpenPI package under the same model, task prompt, deadline, verifier and candidate boundary.

The strongest positive signal is the `explicit` discovery mode: OpenPI passed 15/15 cells versus Bare Pi 10/15, while using 45.2% fewer recorded tokens, 33.6% lower recorded cost, and 27.7% less total wall time. The result supports continuing Pi-native, low-residency, explicit capability disclosure as the default direction.

The `adaptive` mode is a separate control: hidden-verifier passes were tied at 12/15, but OpenPI used 149.2% more tokens, 46.5% more cost, and 43.0% more wall time. It remains opt-in until a task naturally requiring extra capabilities shows a verifiable benefit.

## Frozen contract

| Item | Value |
| --- | --- |
| Pi | `0.84.1` |
| OpenPI | `2a69d3f32994da4123f1312b7fa84ef3d6119be1` |
| OpenPI content SHA-256 | `6740901a9d2106d4ac2811ac4eec680fe8a0ac374d1acdfe1204d151322b5a3b` |
| Provider/model | `openai-codex/gpt-5.6-luna` |
| Thinking | `high` |
| Cell deadline | 600 seconds |
| Repeats | 3, counterbalanced `AB / BA / AB` |
| Modes | `explicit`, `adaptive` |
| Formal cells | 60 |
| Execution | independent live provider sampling |
| Candidate boundary | `candidate-tool-boundary-v6-paired-cwd` |

The explicit pair's first provider payloads have identical canonical SHA-256 after removing the per-session `prompt_cache_key`; the cache key itself is session-specific. Adaptive intentionally has a different initial capability schema and is not request-identical.

## Tasks

| Task | What it exercises | Language/type |
| --- | --- | --- |
| Go Book Store | discount combinations and minimum order price | Go algorithmic task |
| Python Bottle Song | strict lyric formatting and singular/plural boundaries | Python formatting task |
| JavaScript Connect | Hex-board graph connectivity | JavaScript graph task |
| Rust Nucleotide Codons | IUPAC codon expansion and amino-acid parsing | Rust API/parsing task |
| Adaptive Policy Discovery | locating authoritative configuration and removing stale hardcoding | synthetic repository-policy probe |

The first four are small Exercism/Aider-style polyglot exercises. The fifth is a synthetic capability-policy probe and is reported as part of this product experiment, not as evidence of general software-engineering coverage.

## Explicit results

| Metric | Bare Pi | OpenPI explicit | Relative change |
| --- | ---: | ---: | ---: |
| Hidden verifier pass | 10/15 | **15/15** | **+5 pass / +33.3pp** |
| Total wall time | 1,934.145s | **1,398.807s** | **-27.7%** |
| Cell wall median | 130.975s | **77.372s** | **-40.9%** |
| Total recorded tokens | 906,076 | **496,186** | **-45.2%** |
| Cell token median | 45,285 | **17,668** | **-61.0%** |
| Cache read | 557,568 | **274,432** | **-50.8%** |
| Reasoning tokens | 58,086 | **42,298** | **-27.2%** |
| Parent turns | 144 | **112** | **-22.2%** |
| Recorded cost | $0.161608 | **$0.107380** | **-33.6%** |
| Capability calls | 0 | 0 | 0 |

| Task | Bare Pi | OpenPI explicit |
| --- | ---: | ---: |
| Go Book Store | 1/3 | **3/3** |
| Python Bottle Song | 1/3 | **3/3** |
| JavaScript Connect | 2/3 | **3/3** |
| Rust Nucleotide Codons | 3/3 | 3/3 |
| Adaptive Policy Discovery | 3/3 | 3/3 |

Across 15 paired comparisons, OpenPI won 5 quality comparisons, Bare Pi won 0, and 10 were ties. The two-sided exact sign test over the five non-ties is `p=0.0625`: a strong directional signal for this pilot, not a general significance claim. The paired median difference is wall `-5.171s` and tokens `-5,423`; total improvement also reflects reduced Bare Pi long-tail trajectories.

No explicit OpenPI cell called `openpi_load_tools`, Subagent, or Workflow. The positive result therefore was not purchased by forcing extra agent calls or a larger model budget, and this run provides low-interference evidence for the explicit surface.

## Adaptive control

| Metric | Bare Pi | OpenPI adaptive | Relative change |
| --- | ---: | ---: | ---: |
| Protocol-valid pass | **12/15** | 11/15 | -1 pass / -6.7pp |
| Hidden verifier pass | 12/15 | 12/15 | tied |
| Total wall time | **1,387.968s** | 1,984.656s | +43.0% |
| Total recorded tokens | **512,209** | 1,276,658 | +149.2% |
| Cache read | **274,432** | 939,520 | +242.4% |
| Parent turns | **109** | 181 | +66.1% |
| Recorded cost | **$0.109469** | $0.160404 | +46.5% |
| `openpi_load_tools` calls | 0 | 2 | +2 |

The fixed initial gateway increment was 100 input tokens; most of the adaptive increase came from longer trajectories. One Rust cell attempted an unauthorized `subagent_spawn` after loading delegate capability; the runtime guard blocked it and recorded a violation receipt, so it remains an infrastructure/protocol failure rather than an ordinary task pass.

## Evidence and archive

The bounded, credential-free manifest is [`2026-08-26-openai-luna-high-manifest.sha256`](../evidence/2026-08-26-openai-luna-high-manifest.sha256). It identifies the explicit and adaptive `run.json`, `summary.json`, and `cells.jsonl` files by SHA-256.

Complete raw ledgers, logs, Session JSONL, candidate snapshots and verifier output remain in the operator-local archive reference `openpi-luna-high-2026-08-26`. The two immutable result roots contain 610 files and 23,356,879 logical bytes. The SHA-256 of their complete, path-sorted `sha256  relative-path` manifest stream is `985bb48c919455b87638803daee1e201205353b4f07e7889c76bb557570bc1b7`. They are intentionally not bulk-published here. The archive contains no retained provider credentials or private settings; credential cleanup was verified before durable evidence collection.

The run recorded the following implementation identities:

- runner SHA-256: `7cd821cba20732279fa7800c7ecdbe69f4d31171f3783ea2cea52be4084e3d3e`;
- runtime guard SHA-256: `7d9dd1ed0ab1b1869c7bed575e200e77b12dbb6b2e7ad52bc9920cb96a369a15`;
- provider request fingerprint helper SHA-256: `05ab042d9e753112f9044decb1eaed03201becb085e6cd39bf4b04e86578c4bb`;
- paired workspace SHA-256: `074923bdb02036fca366a04939d8f1f3f9dc01188eb5bc1643a191fd2a0503b0`.

The archive identity, file count, logical size and complete-manifest receipt above let an operator prove which local evidence root was used without publishing private Session inventory. The six promoted summary, cell-ledger and run files are independently verifiable through the repository manifest.

## Reproduction entry point

Use the comparison contract in [`PI_OPENPI_BENCHMARK_PROTOCOL.md`](../PI_OPENPI_BENCHMARK_PROTOCOL.md) with the frozen identities above. The runner is the operator-local `scripts/benchmark-pi-openpi.mjs` whose SHA-256 is recorded above. From the OpenPI checkout used for the rerun, execute one command per discovery mode:

```bash
node scripts/benchmark-pi-openpi.mjs --out <new-explicit-result-root> --repeats 3 --timeout 600 --model openai-codex/gpt-5.6-luna --thinking high --tasks go-book-store,python-bottle-song,javascript-connect,rust-nucleotide-codons,adaptive-policy-discovery --openpi-capability-discovery explicit
node scripts/benchmark-pi-openpi.mjs --out <new-adaptive-result-root> --repeats 3 --timeout 600 --model openai-codex/gpt-5.6-luna --thinking high --tasks go-book-store,python-bottle-song,javascript-connect,rust-nucleotide-codons,adaptive-policy-discovery --openpi-capability-discovery adaptive
```

The operator must supply scoped Pi auth/model configuration through the runner's documented flags; credentials never enter the record. A rerun must create a new dated archive and manifest, and must not overwrite this record or bulk-add ignored raw assets.

## Failure classification

- **Artifact:** hidden verifier outcome for the candidate work.
- **Protocol:** deadline, cleanup, or required interaction contract.
- **Infrastructure/provider:** route, authentication, host, or runner faults;
  these are not model failures.
- **Verifier:** post-exit verification or oracle faults; report separately from
  artifact quality.
- **Capability policy:** blocked unauthorized calls are recorded as protocol
  evidence, not silently counted as task success.

## Evidence boundary and limitations

- The task set is small: four compact polyglot exercises plus one synthetic policy probe. It does not represent large, multi-module repository work, dependency migrations, long-lived maintenance, or real issue resolution.
- Three repeats do not turn five task identities into a large independent sample. The result is a product-diagnostic pilot, not a general capability ranking.
- The explicit pair uses independent live sampling. Identical semantic request payloads do not mean identical model outputs; the observed quality and efficiency difference cannot be assigned to one OpenPI mechanism from this run alone.
- The run covers one provider route, one model and one thinking level. Cache-read volume is reported separately and is not treated as total-cost savings by itself.
- No Subagent or Workflow adoption occurred in explicit mode, so this report does not establish orchestration payoff.
- This is not an official Terminal-Bench, SWE-bench or DeepSWE submission.

These limitations bound the claim without negating the observation: on this frozen multilingual pilot, OpenPI explicit produced the better realized result and lower measured resource use. The next validation slice is real repository-scale tasks with independently reported capability adoption and verifier outcomes.

## Related records

- Public summary and discussion: [Issue #197](https://github.com/tt-a1i/openpi/issues/197)
- Knowledge/evidence publication contract: [Issue #198](https://github.com/tt-a1i/openpi/issues/198)
- Comparison protocol: [`PI_OPENPI_BENCHMARK_PROTOCOL.md`](../PI_OPENPI_BENCHMARK_PROTOCOL.md)
- Prior Benchmark ledger: [`README.md`](../README.md)
