import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Still marker for the push-based footer status. It deliberately does not
 * import the subagent spinner: `shared/` must not depend on a single
 * extension's internals, and a pushed string cannot animate anyway.
 */
const RUNNING_MARK = "●";

type Theme = ExtensionContext["ui"]["theme"];

export interface ActivityCounts {
  running: number;
  done: number;
  failed: number;
}

/**
 * Settled work is an unread notice, not a session tally: `done`/`failed` stay
 * visible until the user's next explicit request acknowledges them, while
 * running work is always reported. `acknowledgedAt` is the timestamp of that
 * last explicit request. A settle in that same millisecond, or one carrying no
 * timestamp, stays unread rather than being silently swallowed.
 */
export function unreadActivityCounts(
  items: readonly {
    readonly status: "running" | "done" | "error";
    readonly settledAt?: number;
  }[],
  acknowledgedAt: number,
): ActivityCounts {
  let running = 0;
  let done = 0;
  let failed = 0;
  for (const item of items) {
    if (item.status === "running") {
      running += 1;
      continue;
    }
    if (item.settledAt !== undefined && item.settledAt < acknowledgedAt)
      continue;
    if (item.status === "error") failed += 1;
    else done += 1;
  }
  return { running, done, failed };
}

export function hasActivity(counts: ActivityCounts) {
  return counts.running + counts.done + counts.failed > 0;
}

/**
 * `ui.setStatus` stores a finished string and is only called when the watched
 * work changes, so this line is NOT re-evaluated per frame. A spinner here
 * would freeze on whatever frame the last event happened to land on, which
 * reads as a hung UI. The animated glyph belongs to the strip, which owns a
 * render loop; the footer states the count with a still marker.
 */
export function formatActivityStatus(
  theme: Theme,
  label: "subagents" | "workflows",
  counts: ActivityCounts,
  stripVisible = false,
) {
  const parts: string[] = [];
  if (counts.running > 0) {
    parts.push(
      theme.fg("warning", `${RUNNING_MARK} ${counts.running} running`),
    );
  }
  if (counts.done > 0) {
    parts.push(theme.fg("success", `✓ ${counts.done} done`));
  }
  if (counts.failed > 0) {
    parts.push(theme.fg("error", `✗ ${counts.failed} failed`));
  }
  if (!stripVisible) {
    parts.push(theme.fg("accent", `/${label}`) + theme.fg("dim", " to view"));
  }

  return `${theme.fg("muted", `${label}:`)} ${parts.join(theme.fg("dim", " · "))}`;
}
