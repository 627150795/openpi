# Reviewing the PR 711 split

- Status: validated for source attribution and local checks; not a merge-readiness record.
- Created and verified: 2026-10-14.
- Source boundary: original PR [#711](https://github.com/openpi-dev/openpi/pull/711), base `a18f457687b45c877bc8a15d689a7580c4f0659a`, head `7daee1eb818e60d3bf52e79edb1b3ef1cfecd9a1`.
- Complete source candidate: `feb079a853ce6659a748e2645d842dc825ce295f`; generated companion: `9e3c3a8c443e8da00c46195f9f9fe67dded15a9a`.
- Tracking: [#788](https://github.com/openpi-dev/openpi/issues/788); source/artifact landing prerequisite: [#818](https://github.com/openpi-dev/openpi/issues/818).
- Supersedes no accepted Decision or historical research conclusion.

## Review boundaries

The frozen original contains 116 commits and changes 329 files. Existing Drafts were retained at the author's request. Remaining changes follow topics rather than arbitrary commit counts. Each later PR targets the preceding branch, so its Files changed tab shows only that topic.

| Order | Topic | Draft | Work issue |
| --- | --- | --- | --- |
| 1 | Activity and tool groups | [#802](https://github.com/openpi-dev/openpi/pull/802) | #791 |
| 2 | Resource reading | [#807](https://github.com/openpi-dev/openpi/pull/807) | #792 |
| 3 | Models and workbar | [#808](https://github.com/openpi-dev/openpi/pull/808) | #793 |
| 4 | Existing browser implementation | [#809](https://github.com/openpi-dev/openpi/pull/809) | #794 |
| 5 | Existing native search and trajectory | [#810](https://github.com/openpi-dev/openpi/pull/810) | #795 |
| 6 | Native search hardening from #755 | [#812](https://github.com/openpi-dev/openpi/pull/812) | #811 |
| 7 | Pi 1.2.0 and managed startup #765 | [#815](https://github.com/openpi-dev/openpi/pull/815) | #800 |
| 8 | Code Mode default | [#816](https://github.com/openpi-dev/openpi/pull/816) | #813 |
| 9 | Browser choices through canonical setup | [#817](https://github.com/openpi-dev/openpi/pull/817) | #814 |
| 10 | Settings | [#819](https://github.com/openpi-dev/openpi/pull/819) | #796 |
| 11 | Subagent activity and exact-child inspection | [#820](https://github.com/openpi-dev/openpi/pull/820) | #797 |
| 12 | Conversation and worktree runtime | [#821](https://github.com/openpi-dev/openpi/pull/821) | #798 |
| 13 | Sidebar and fork UI | [#822](https://github.com/openpi-dev/openpi/pull/822) | #799 |
| 14 | Fonts, activity and continuity | [#823](https://github.com/openpi-dev/openpi/pull/823) | #801 |

Generated assets and remaining historical research records have separate companions tracked by #818. Earlier alternate Drafts #803–#806 remain open; they are not additional steps in this chain. Reordering or closing an existing Draft needs a separate author request.

## What intentionally differs from the frozen source

Native-search hardening preserves the #755 fix and its author attribution: repeated answer text does not transfer search evidence between turns, and incremental bounded capture does not retain an unlimited stream. Browser authorization and default choices go through `/openpi-setup`; direct writes fail closed. This uses the existing configuration contract and does not claim that a new browser Decision was accepted.

The browser work overlaps [#720](https://github.com/openpi-dev/openpi/pull/720). #817 records the setup-policy correction; maintainers still need to choose and coordinate the browser implementation before landing it. This split neither changes #720 nor resolves that ownership choice by implication.

Final test alignment waits for actual font readiness before geometry assertions and preserves the browser busy-state expectation established by the setup correction. Historical research is restored byte-for-byte from the frozen source; its original status, dates and evidence boundaries remain historical, not newly validated claims.

## Evaluate test value by failure mode

Each topical PR describes its unique regression protection in its Validation section. Review native execution and persisted state separately from UI projections. In particular, exact-child identity is different from a displayed task label; fork cleanup and race protection are different from sidebar menu access; setup admission is different from a confirmed configuration save.

The final source and generated companion passed `bun run check` and `bun run test` locally with Bun 1.3.14, Node 24.20.0, locked Pi 1.2.0, isolated Pi preferences, and four UI test workers: 2,538 Node tests passed, 9 skipped; 1,453 UI tests passed across 94 files. Intermediate candidate receipts and failures remain outside Git under task identity `pr711-split-20261014`. A historical failure is not silently replaced by a later pass.

Managed startup was also checked on isolated official Pi 0.99.1 and 1.2.0 hosts, with no local Pi peers in the exported package. Removing the upgrade's provider alias caused both controls to fail; restoring it restored startup. The final generated candidate served its HTML and all referenced local assets and rejected direct browser authorization writes. These controls do not claim live-provider or personal-browser acceptance.

Browser acceptance and remote CI are tracked separately in #788. A custom-port full browser run had 147 passes and 8 failures, including hardcoded-origin mismatches. The subsequent complete run at the repository's canonical port passed all 155 cases on the same frozen source with the generated companion, using system Chrome and isolated Pi preferences. Both receipts remain available; no retry result erases the earlier failures. Local browser and unit checks do not imply remote CI is green.

## Landing prerequisite

Current CI rebuilds Web and rejects stale committed `web/dist`; source archives also depend on those assets. Excluding generated output from feature diffs therefore makes the new source-only Drafts unsuitable for independent landing under that guard. Maintainers must synchronize assets with the corresponding source at landing, or review a separate build/distribution change. The split does not weaken CI or select that policy for them. #818 keeps this prerequisite explicit.

Review the dependency chain in order, resolve browser overlap and observed CI failures, and confirm source/asset synchronization on the actual landing head. The original #711 and the earlier Draft heads remain comparison sources, not evidence that every extracted intermediate head is mergeable.

## Author-requested CI and conflict repair — 2026-10-14

This amendment supersedes the operational instructions above about preserving
Draft status, retaining alternatives, and delaying generated-asset synchronization.
The frozen source identities and historical validation receipts above remain
unchanged. Tracking and the latest exact-head CI audit are in [#788](https://github.com/openpi-dev/openpi/issues/788).

The author subsequently requested that every active split resolve conflicts, pass
its own CI, and become Ready for review. Duplicate alternatives #803–#806 were
closed, with their branches retained. #720 was also closed as superseded by #809
plus #817; its head `6168bdf086ac1ab61501a09509cc2c61302d547e` is an ancestor
of frozen #711, so this retires an overlapping PR rather than dropping unique work.

Current `main` at `bcf74cad8a576b0e765d0636bdc2dbd5615d8a69` was integrated
at the chain's root and propagated forward. Updates preserve the published topic
heads as ancestors. Where source conflicts arise, both the topic's behavior and
accepted upstream fixes must be retained. In particular, sidebar fork replay must
coexist with the upstream exact-child confirmation race protection.

Each affected feature now carries generated Web output matching its own source.
This satisfies the existing committed-build and source-install contract without
weakening the freshness gate. Long research notes remain in #825. The separate
generated companion #824 becomes redundant once its output is covered by these
feature commits; it is not an additional feature to merge.

The repair retains regression coverage rather than relaxing time limits: Plan
fixtures retire their exact native turn before restoring configuration and closing
the provider; reading fixtures distinguish an older anchor from explicit bottom
following; workbar/menu fixtures use the corresponding topic's actual controls;
provider login waits for asynchronous control readiness; Windows process-heavy
workflow fixtures use the existing isolated group. Upstream #726 seeds the bounded
workbar store instead of repeatedly rendering 31 identical setup interactions.
No new product abstraction, permission path, or testing framework is introduced.

### Review and landing order

`#802 → #807 → #808 → #809 → #810 → #812 → #815 → #816 → #817 → #819 → #820 → #821 → #822 → #823 → #825`

- Review **Files changed against each declared base**, so the diff shows that
  topic. Read browser #809 with policy #817, and search #810 with hardening #812,
  before approving the final behavior. #825 is documentation only.
- Ready status is earned per published head: its full CI must pass and GitHub must
  report no conflict with its current base. A passing descendant cannot substitute
  for a failing parent. #788 records heads and CI run links rather than inferring
  readiness from this document.
- Land parent before child. A child currently targets a predecessor branch;
  **do not merge it into that unmerged predecessor**. After the parent lands,
  prepare the next topic against current `main`, inspect the remaining diff,
  synchronize that source's output, and rerun CI on the landing head.
- Follow the [linear-history guide](linear-git-history.md) when landing. Squash or
  rebase changes parent identities, so merely changing a child's base may retain
  duplicate ancestor changes; refresh the dependent history before merge. An
  internal conflict-resolution merge is development history, not an instruction
  to create merge commits on `main` or bypass branch protection.

The combined feature scope remains #711 with the intentional #755 native-search
hardening, setup-only browser policy, accepted upstream fixes, and scoped CI
repairs. The original #711 is a frozen comparison source, not a further landing
step. No PR is merged by the splitting or readiness work itself.
