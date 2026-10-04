import {
  type AgentToolResult,
  keyHint,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { TSchema } from "typebox";
import { sanitizeTerminalText } from "../shared/terminal-text.ts";

export type CodemodeRenderers = Pick<
  ToolDefinition<TSchema, unknown, unknown>,
  "renderShell" | "renderCall" | "renderResult"
>;

const RECENT_CALLS = 4;
const SALIENT_CALLS = 2;
const OUTPUT_LINES = 5;
const JSON_LIMIT = 32_768;
const PREVIEW_CHARS = 4_096;
const HEADER =
  /^Script (completed|failed)\nWall time (\d+(?:\.\d+)?) seconds\nOutput:\n$/u;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safe(value: unknown) {
  return sanitizeTerminalText(string(value));
}

function inline(value: unknown, limit = 512) {
  return safe(string(value).slice(0, limit)).replace(/\n/gu, " ");
}

function duration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value < 1_000
      ? `${Math.round(value)}ms`
      : `${(value / 1_000).toFixed(1)}s`
    : "";
}

function expandHint() {
  return keyHint("app.tools.expand", "to expand");
}

/** Decode only the outer JSON value. Nested string fields remain literal data. */
function outputProjection(raw: string) {
  if (raw.length > JSON_LIMIT) return { text: raw, decoded: false };
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "string") return { text: value, decoded: true };
    if (value && typeof value === "object") {
      const pretty = JSON.stringify(value, null, 2);
      if (pretty.length <= JSON_LIMIT) return { text: pretty, decoded: true };
    }
  } catch {
    // Ordinary text and incomplete streaming JSON retain their exact meaning.
  }
  return { text: raw, decoded: false };
}

function callStatus(call: Record<string, unknown>) {
  switch (call.status) {
    case "running":
    case "ok":
    case "error":
    case "cancelled":
      return call.status;
    default:
      return "unknown";
  }
}

const ICON = {
  running: "…",
  ok: "✓",
  error: "✗",
  cancelled: "⊘",
  unknown: "?",
} as const;
const ICON_COLOR = {
  running: "muted",
  ok: "success",
  error: "error",
  cancelled: "warning",
  unknown: "warning",
} as const;

type Tone = "toolPendingBg" | "toolSuccessBg" | "toolErrorBg";

/** Mirror Pi's default tool shell (padded, tinted block) with a tone derived from all evidence. */
function framed(
  theme: Theme,
  tone: () => Tone,
  body: (width: number) => string[],
  edges: { top: boolean; bottom: () => boolean },
): Component {
  return {
    render(width) {
      if (!Number.isInteger(width) || width < 1) return [];
      const pad = width > 8 ? 1 : 0;
      const rows = body(width - pad * 2).map((row) => " ".repeat(pad) + row);
      if (!rows.length) return [];
      if (edges.top) rows.unshift("");
      if (edges.bottom()) rows.push("");
      const bg = tone();
      return rows.map((row) =>
        theme.bg(bg, row + " ".repeat(Math.max(0, width - visibleWidth(row)))),
      );
    },
    invalidate() {},
  };
}

/**
 * The first top-level string argument (path, command, pattern…) identifies a
 * call at a glance. Native previews are JSON truncated at 200 chars, so this
 * reads only a complete leading string literal and otherwise shows nothing.
 */
function argHint(args: unknown) {
  const match = /^\{"[^"\\]*":("(?:[^"\\]|\\.)*")/u.exec(string(args));
  if (!match) return "";
  try {
    return inline(JSON.parse(match[1]!)).trim();
  } catch {
    return "";
  }
}

function callLine(
  call: Record<string, unknown>,
  expanded: boolean,
  theme: Theme,
  width = Number.POSITIVE_INFINITY,
) {
  const status = callStatus(call);
  const name = expanded ? safe(call.name) : inline(call.name);
  const meta: string[] = [];
  if (string(call.error))
    meta.push(expanded ? "error" : `error: ${inline(call.error)}`);
  else if (status !== "ok") meta.push(status);
  const time = duration(call.durationMs);
  if (time) meta.push(time);
  if (
    typeof call.cost === "number" &&
    Number.isFinite(call.cost) &&
    call.cost >= 0
  )
    meta.push(`$${call.cost.toPrecision(3)}`);
  const tail = meta.length ? ` · ${meta.join(" · ")}` : "";
  let line = `${theme.fg(ICON_COLOR[status], ICON[status])} ${theme.fg(status === "error" ? "error" : "toolTitle", name)}`;
  // The hint yields its width to status, error and timing facts.
  const hint = expanded ? "" : argHint(call.args);
  const budget = width - visibleWidth(line) - visibleWidth(tail) - 1;
  if (hint && budget >= 4)
    line += ` ${theme.fg("muted", truncateToWidth(hint, budget, "…"))}`;
  if (tail) line += theme.fg("dim", tail);
  if (expanded && string(call.args))
    line += `\n  ${theme.fg("muted", "args")} ${theme.fg("toolOutput", safe(call.args))}`;
  if (expanded && string(call.error))
    line += `\n  ${theme.fg("error", `error ${safe(call.error)}`)}`;
  return line;
}

type Color = "muted" | "dim" | "error" | "warning" | "success" | "toolOutput";

function wrapped(text: string, theme: Theme, width: number, color?: Color) {
  // A grapheme may be wider than an extremely narrow terminal.
  return new Text(color ? theme.fg(color, text) : text, 0, 0)
    .render(width)
    .map((line) => truncateToWidth(line, width));
}

function toneOf(state: Record<string, unknown> | undefined): Tone {
  const tone = state?.codemodeTone;
  return tone === "toolSuccessBg" || tone === "toolErrorBg"
    ? tone
    : "toolPendingBg";
}

function resultComponent(
  result: AgentToolResult<unknown>,
  expanded: boolean,
  partial: boolean,
  isError: boolean,
  showImages: boolean,
  theme: Theme,
  state: Record<string, unknown> | undefined,
): Component {
  const details = record(result.details);
  const ledger = Array.isArray(details?.calls) ? details.calls : undefined;
  const calls = ledger ? ledger.map((call) => record(call) ?? {}) : [];
  const counts = { running: 0, ok: 0, error: 0, cancelled: 0, unknown: 0 };
  for (const call of calls) counts[callStatus(call)]++;
  const first = result.content[0];
  const header = first?.type === "text" ? HEADER.exec(first.text) : null;
  const knownHeader =
    header && Number.isFinite(Number(header[2])) ? header : null;
  const output = (knownHeader ? result.content.slice(1) : result.content)
    .filter((item) => item.type === "text")
    .map((item) => item.text);
  const projections = output.map(outputProjection);
  const images = result.content.filter((item) => item.type === "image").length;
  const failed = isError || knownHeader?.[1] === "failed";
  const outcome = partial
    ? "running"
    : failed
      ? "failed"
      : knownHeader
        ? "completed"
        : "finished";
  // Success tint requires the exact native header and a fully ok ledger;
  // nested issues and unknown evidence stay neutral rather than green.
  const tone: Tone = failed
    ? "toolErrorBg"
    : !partial && knownHeader && ledger && counts.ok === calls.length
      ? "toolSuccessBg"
      : "toolPendingBg";
  const facts = [
    ...(partial ? [] : [knownHeader ? `${knownHeader[2]}s` : "time unknown"]),
    ledger
      ? `${calls.length} ${calls.length === 1 ? "call" : "calls"}`
      : "calls unknown",
  ];
  const outcomeIcon = {
    running: [ICON.running, "muted"],
    failed: [ICON.error, "error"],
    completed: [ICON.ok, "success"],
    finished: [ICON.unknown, "warning"],
  } as const;
  const [icon, iconColor] = outcomeIcon[outcome];
  const outcomeText = `${theme.fg(iconColor, outcome)}${theme.fg("muted", ` · ${facts.join(" · ")}`)}`;
  const statusLine = `${theme.fg(iconColor, icon)} ${outcomeText}`;
  // A call header rendered from the same row state carries the status line.
  const merged = state?.codemodeHeader === true;
  if (state) {
    state.codemodeTone = tone;
    state.codemodeResult = true;
    state.codemodeIcon = theme.fg(iconColor, icon);
    state.codemodeOutcome = outcomeText;
  }
  const outputColor = failed ? "error" : "toolOutput";

  const expandedRows = (width: number) => {
    const rows = merged ? [] : [truncateToWidth(statusLine, width, "")];
    if (knownHeader && first?.type === "text")
      rows.push(
        ...wrapped(
          `Native result header\n${safe(first.text)}`,
          theme,
          width,
          "muted",
        ),
      );
    const summary = ledger
      ? `${calls.length} calls · ${counts.error} error · ${counts.cancelled} cancelled · ${counts.running} running · ${counts.ok} ok${counts.unknown ? ` · ${counts.unknown} unknown` : ""}`
      : "Calls unknown (no recorded ledger)";
    rows.push(...wrapped(`Calls\n${summary}`, theme, width, "muted"));
    for (const call of calls)
      rows.push(...wrapped(callLine(call, true, theme), theme, width));
    if (!calls.length)
      rows.push(
        ...wrapped("(no recorded nested calls)", theme, width, "muted"),
      );
    rows.push(...wrapped("Output", theme, width, "muted"));
    output.forEach((raw, index) => {
      const projection = projections[index]!;
      if (projection.decoded) {
        rows.push(
          ...wrapped(
            "Display projection (outer JSON decoded)",
            theme,
            width,
            "muted",
          ),
          ...wrapped(safe(projection.text), theme, width, outputColor),
          ...wrapped(
            "Raw output (terminal controls stripped)",
            theme,
            width,
            "muted",
          ),
        );
      }
      rows.push(...wrapped(safe(raw), theme, width, outputColor));
    });
    if (!output.length)
      rows.push(
        ...wrapped(
          partial
            ? "(output pending)"
            : images
              ? "(image output)"
              : "(no text output)",
          theme,
          width,
          "muted",
        ),
      );
    return rows;
  };

  const compactRows = (width: number) => {
    const rows = merged ? [] : [statusLine];
    const indent = width > 16 ? "  " : "";
    const issue = (call: Record<string, unknown>) =>
      ["error", "cancelled", "unknown"].includes(callStatus(call));
    const recentStart = Math.max(0, calls.length - RECENT_CALLS);
    const salient = calls
      .slice(0, recentStart)
      .filter(issue)
      .slice(-SALIENT_CALLS);
    const recent = calls.slice(recentStart);
    const hidden = calls.length - salient.length - recent.length;
    // Nested outcomes are not the outer script's status. A total row keeps
    // any issue that the bounded call list cannot show visible.
    const shown = [...salient, ...recent];
    for (const status of ["error", "cancelled", "unknown"] as const) {
      const count = counts[status];
      if (count > shown.filter((call) => callStatus(call) === status).length)
        rows.push(
          theme.fg(
            ICON_COLOR[status],
            `${ICON[status]} ${count} nested ${status}`,
          ),
        );
    }
    const line = (call: Record<string, unknown>) =>
      indent + callLine(call, false, theme, width - indent.length);
    rows.push(...salient.map(line));
    if (hidden)
      rows.push(
        theme.fg(
          "dim",
          `${indent}⋯ ${hidden} more ${hidden === 1 ? "call" : "calls"}`,
        ),
      );
    rows.push(...recent.map(line));
    let more = "";
    if (partial) rows.push(theme.fg("muted", "Output pending"));
    else if (output.length) {
      const joined = projections
        .map((projection) => projection.text)
        .join("\n");
      // Blank lines spend the preview budget without showing anything.
      const visible = joined
        .slice(0, PREVIEW_CHARS)
        .split("\n")
        .filter((row) => row.trim())
        .join("\n");
      // A gutter separates script output from the call list above it.
      const gutter = width > 16 ? theme.fg("dim", "│ ") : "";
      const lines = wrapped(
        safe(visible),
        theme,
        width - visibleWidth(gutter),
        outputColor,
      );
      rows.push(...lines.slice(0, OUTPUT_LINES).map((row) => gutter + row));
      if (joined.length > PREVIEW_CHARS) more = "… more output · ";
      else if (lines.length > OUTPUT_LINES) {
        const count = lines.length - OUTPUT_LINES;
        more = `… ${count} more ${count === 1 ? "line" : "lines"} · `;
      }
    }
    rows.push(theme.fg("dim", more) + expandHint());
    return rows.map((row) => truncateToWidth(row, width, ""));
  };

  return framed(
    theme,
    () => tone,
    (width) => {
      const rows = expanded ? expandedRows(width) : compactRows(width);
      if (images)
        rows.push(
          truncateToWidth(
            theme.fg(
              "muted",
              showImages ? `Images: ${images}` : `[image] × ${images}`,
            ),
            width,
            "",
          ),
        );
      if (string(details?.fullOutputPath)) {
        const path = `Full output: ${expanded ? safe(details?.fullOutputPath) : inline(details?.fullOutputPath)}`;
        rows.push(
          ...(expanded
            ? wrapped(path, theme, width, "muted")
            : [truncateToWidth(theme.fg("muted", path), width, "")]),
        );
      }
      return rows;
    },
    { top: false, bottom: () => true },
  );
}

/** Presentation only: native executor, results, provenance and images stay Pi-owned. */
export const codemodeRenderers: CodemodeRenderers = {
  renderShell: "self",
  renderCall(args, theme, context) {
    const state = record(context.state);
    const code = record(args)?.code;
    const lines =
      typeof code === "string" && code ? code.split(/\r?\n/u).length : 0;
    const detail =
      typeof code === "string"
        ? `${lines} script lines`
        : context.argsComplete
          ? "invalid script argument"
          : "receiving script";
    if (state) state.codemodeHeader = true;
    const name = theme.fg("toolTitle", theme.bold("codemode"));
    const title = () => {
      const outcome = string(state?.codemodeOutcome);
      return outcome
        ? `${string(state?.codemodeIcon)} ${name} ${outcome}${theme.fg("muted", ` · ${detail}`)}`
        : `${name}${theme.fg("muted", ` · ${detail}`)}`;
    };
    return framed(
      theme,
      () => toneOf(state),
      (width) => {
        if (context.expanded)
          return [
            truncateToWidth(title(), width, ""),
            ...wrapped("Script", theme, width, "muted"),
            ...wrapped(
              typeof code === "string" ? safe(code) : "(script unavailable)",
              theme,
              width,
              "toolOutput",
            ),
          ];
        // The result footer carries the hint once a result exists.
        const hint = state?.codemodeResult ? "" : ` · ${expandHint()}`;
        return [truncateToWidth(title() + hint, width)];
      },
      { top: true, bottom: () => !state?.codemodeResult },
    );
  },
  renderResult(result, options, theme, context) {
    return resultComponent(
      result,
      options.expanded,
      options.isPartial,
      context.isError,
      context.showImages,
      theme,
      record(context.state),
    );
  },
};
