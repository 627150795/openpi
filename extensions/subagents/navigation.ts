import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import {
  fitNavigationSides,
  type BelowEditorStripState,
} from "../shared/below-editor-navigation.ts";
import {
  unreadActivityCounts,
  type ActivityCounts,
} from "../shared/activity-status.ts";
import { sanitizeTerminalText } from "../shared/terminal-text.ts";
import { formatElapsed, type SubagentSnapshot } from "./src/domain.ts";
import { statusGlyph } from "./src/ui/takeover.ts";
import { SPINNER_INTERVAL_MS } from "./src/ui/transcript.ts";

export interface SubagentStripEntry {
  snapshot: SubagentSnapshot;
  counts: ActivityCounts;
}

function cleanLine(value: string) {
  return sanitizeTerminalText(value).replace(/\s+/g, " ").trim();
}

/** Normalize every title before it enters snapshots, artifacts, or the TUI. */
export function normalizeSubagentTitle(value: string, fallback = "subagent") {
  return cleanLine(value).slice(0, 160) || fallback;
}

/** Prefer the newest running child, then the newest unread settled child. */
export function selectSubagentStripEntry(
  snapshots: readonly SubagentSnapshot[],
  acknowledgedAt: number,
): SubagentStripEntry | undefined {
  const counts = unreadActivityCounts(snapshots, acknowledgedAt);
  const visible = snapshots.filter(
    (snapshot) =>
      snapshot.status === "running" ||
      snapshot.settledAt === undefined ||
      snapshot.settledAt >= acknowledgedAt,
  );
  const candidates = visible.some((snapshot) => snapshot.status === "running")
    ? visible.filter((snapshot) => snapshot.status === "running")
    : visible;
  let selected: SubagentSnapshot | undefined;
  for (const snapshot of candidates) {
    const timestamp = snapshot.settledAt ?? snapshot.createdAt;
    const selectedTimestamp = selected
      ? (selected.settledAt ?? selected.createdAt)
      : -Infinity;
    if (timestamp >= selectedTimestamp) selected = snapshot;
  }
  return selected ? { snapshot: selected, counts } : undefined;
}

function statusColor(status: SubagentSnapshot["status"]) {
  if (status === "running") return "warning" as const;
  if (status === "done") return "success" as const;
  return "error" as const;
}

/** One-line subagent manager entry with the same affordance as Workflow. */
export class SubagentStripWidget {
  private timer?: ReturnType<typeof setInterval>;
  private timerInterval = 0;
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly strip: BelowEditorStripState;
  private readonly getEntry: () => SubagentStripEntry | undefined;

  constructor(
    tui: TUI,
    theme: Theme,
    strip: BelowEditorStripState,
    getEntry: () => SubagentStripEntry | undefined,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.strip = strip;
    this.getEntry = getEntry;
    this.refreshTimer(false);
  }

  /** A running subagent animates a spinner, so repaint at its cadence. */
  private refreshTimer(running: boolean) {
    const interval = running ? SPINNER_INTERVAL_MS : 500;
    if (interval === this.timerInterval) return;
    if (this.timer) clearInterval(this.timer);
    this.timerInterval = interval;
    this.timer = setInterval(() => this.tui.requestRender(), interval);
    this.timer.unref?.();
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.timerInterval = 0;
  }

  invalidate() {}

  render(width: number) {
    const entry = this.getEntry();
    if (!entry || width <= 0) return [];
    const { snapshot, counts } = entry;
    this.refreshTimer(snapshot.status === "running");
    // One glyph column: the focus marker when selected, the status glyph —
    // spinner, ✓, ✗ — otherwise. Model and context stay in Pi's footer and
    // the dashboard; this strip owns navigation and progress.
    const glyph = this.strip.focused
      ? this.theme.fg("accent", "❯")
      : statusGlyph(snapshot, this.theme);
    const titleText = normalizeSubagentTitle(snapshot.title, snapshot.id);
    const title = this.strip.focused
      ? this.theme.bold(this.theme.fg("accent", titleText))
      : this.theme.fg("text", titleText);
    const left = ` ${glyph} ${title}`;
    const settled = counts.done + counts.failed;
    const total = counts.running + settled;
    const metrics = [
      total > 1 ? `${settled}/${total} done` : "",
      formatElapsed(snapshot),
      this.strip.focused ? "enter open · ↑ back" : "↓ to manage",
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    const right = this.theme.fg(statusColor(snapshot.status), metrics);
    return [fitNavigationSides(left, right, width)];
  }
}
