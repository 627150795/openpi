import {
  getMarkdownTheme,
  keyHint,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Markdown,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { sanitizeText } from "../../../shared/agent-transcript.ts";

const MAX_STATUS_ROWS = 4;

export interface WaitResultItem {
  readonly id: string;
  readonly title?: string;
  readonly status?: string;
  readonly elapsed?: string;
  readonly artifactSaveFailed?: boolean;
}

export interface WaitResultDetails {
  readonly results?: readonly WaitResultItem[];
}

function singleLine(value: string) {
  return sanitizeText(value).replace(/\s+/gu, " ").trim();
}

function fixedRows(rows: readonly string[]): Component {
  return {
    render(width) {
      return rows.map((row) => truncateToWidth(row, Math.max(1, width), "…"));
    },
    invalidate() {},
  };
}

export function buildWaitResultPreview(
  content: string,
  details: WaitResultDetails | undefined,
  theme: Theme,
) {
  const results = details?.results ?? [];
  const failed = results.filter((result) => result.status === "error").length;
  const artifactFailures = results.filter(
    (result) => result.artifactSaveFailed,
  ).length;
  const header =
    theme.fg(failed > 0 ? "warning" : "success", failed > 0 ? "!" : "✓") +
    ` ${theme.fg("accent", theme.bold(`${results.length} subagent${results.length === 1 ? "" : "s"} settled`))}` +
    (failed > 0 ? theme.fg("error", ` · ${failed} failed`) : "") +
    (artifactFailures > 0
      ? theme.fg(
          "warning",
          ` · ${artifactFailures} artifact${artifactFailures === 1 ? "" : "s"} not saved`,
        )
      : "");
  const lines = [header];

  for (const result of results.slice(0, MAX_STATUS_ROWS)) {
    const isFailure = result.status === "error";
    const icon = theme.fg(
      isFailure ? "error" : "success",
      isFailure ? "x" : "✓",
    );
    const id = singleLine(result.id);
    const title = result.title ? singleLine(result.title) : "";
    const status = singleLine(result.status ?? "settled");
    const elapsed = result.elapsed ? singleLine(result.elapsed) : "";
    const artifact = result.artifactSaveFailed
      ? theme.fg("warning", " · artifact not saved")
      : "";
    lines.push(
      `  ${icon} ${theme.fg("accent", id)}${title ? theme.fg("muted", ` · ${title}`) : ""}${theme.fg("dim", ` · ${status}${elapsed ? ` · ${elapsed}` : ""}`)}${artifact}`,
    );
  }
  if (results.length > MAX_STATUS_ROWS) {
    lines.push(theme.fg("dim", `  … ${results.length - MAX_STATUS_ROWS} more`));
  }

  if (sanitizeText(content).trim()) {
    lines.push(
      theme.fg(
        "dim",
        `Results passed to main agent · ${keyHint("app.tools.expand", "to expand")}`,
      ),
    );
  }
  return lines.join("\n");
}

export function renderWaitResultPreview(
  content: string,
  details: WaitResultDetails | undefined,
  theme: Theme,
) {
  return fixedRows(buildWaitResultPreview(content, details, theme).split("\n"));
}

export function renderWaitResult(
  content: string,
  details: WaitResultDetails | undefined,
  expanded: boolean,
  theme: Theme,
) {
  if (!expanded) {
    return renderWaitResultPreview(content, details, theme);
  }

  const markdown = new Markdown(
    sanitizeText(content),
    0,
    0,
    getMarkdownTheme(),
  );
  return markdown;
}
