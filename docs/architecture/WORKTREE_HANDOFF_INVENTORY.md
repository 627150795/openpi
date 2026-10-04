# Bounded worktree handoff inventory

- Status: draft (candidate implementation; independent review pending)
- Created / verified: 2026-10-04
- Source boundary: #661 candidate based on `94f6dfb29343a699010440f37734ac14582c84af`
- Issue: [#661](https://github.com/openpi-dev/openpi/issues/661)
- Pi seam: existing child Git worktree lifecycle and handoff artifact
- Supersedes: none

## Inventory semantics

`prepareWorktreeHandoff` retains exact sorted NUL-delimited file inventories
when they fit the existing 576 KiB Git-output budget. On buffer overflow only,
it retries with native Git `ls-files --directory --no-empty-directory` under
the same shared five-second deadline and byte budget. No bytes from the failed
enumeration become manifest facts. Git still owns ignore rules and directory
boundaries; filesystem symlinks are not recursively followed by this inventory.

The version-1 `untracked` and `ignored` arrays remain readable as path arrays.
When a fallback is used, an additive `inventoryCoverage` object marks each
array as `complete-files` or `directory-summary`. A trailing `/` denotes a
summarized directory, not an enumerated file. Descendant names, counts, byte
validity, and contents are **not** claimed. Coverage absent in old manifests
and new exact inventories retains the legacy file-name semantics. Neither
mode is a backup of untracked or ignored contents.

If even the directory summary is oversized (for example, many loose files),
preparation fails explicitly without publishing a partial manifest. Patch
(512 KiB), serialized manifest (1 MiB), UTF-8 decoding, and realpath ownership
guards are unchanged. Literal U+FFFD remains valid; invalid emitted UTF-8 is
rejected. Files hidden beneath summaries are not decoded or validated.

## Preservation and evidence boundary

`reclaimWorktree` uses the directory-aware ignored inventory only to establish
presence. Any nonempty result still blocks removal; errors, timeouts, and
oversized loose inventories remain unknown and preserve the checkout. Cleanup
does not infer safety from a handoff manifest and never deletes ignored data.
Other cleanup checks, including status and index inspection, remain unchanged
and may independently exceed their existing budgets and preserve the checkout.

The regression invokes the real `prepareWorktreeHandoff` seam with ignored
file-name output exceeding both the old handoff and cleanup buffers. It checks
patch retention, explicit summary coverage, bounded persistence, and ignored
content preservation through reclaim. Additional cases cover exact legacy
inventories, oversized loose inventories, untracked directory summaries,
literal U+FFFD, invalid emitted UTF-8, and symlink ownership. Invalid-byte
filesystem names are tested on Linux; macOS rejects their creation with EILSEQ.
Full validation results are recorded in the delivery receipt, not asserted here.
