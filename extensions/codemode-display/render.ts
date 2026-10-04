import {
  type AgentToolResult,
  keyHint,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Component, Text, truncateToWidth } from "@earendil-works/pi-tui";
import type { TSchema } from "typebox";
import { sanitizeTerminalText } from "../shared/terminal-text.ts";

export type CodemodeRenderers = Pick<
  ToolDefinition<TSchema, unknown, unknown>,
  "renderShell" | "renderCall" | "renderResult"
>;

const RECENT_CALLS = 4;
const SALIENT_CALLS = 2;
const OUTPUT_LINES = 3;
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

function callLine(call: Record<string, unknown>, expanded: boolean) {
  const status = callStatus(call);
  const icon = {
    running: "…",
    ok: "✓",
    error: "✗",
    cancelled: "⊘",
    unknown: "?",
  }[status];
  let line = `${icon} ${expanded ? safe(call.name) : inline(call.name)} ${status}`;
  const time = duration(call.durationMs);
  if (time) line += ` · ${time}`;
  if (expanded && string(call.args)) line += `\n  Args: ${safe(call.args)}`;
  if (string(call.error)) {
    line += expanded
      ? `\n  Error: ${safe(call.error)}`
      : ` · ${inline(call.error)}`;
  }
  if (
    typeof call.cost === "number" &&
    Number.isFinite(call.cost) &&
    call.cost >= 0
  )
    line += ` · $${call.cost.toPrecision(3)}`;
  return line;
}

function coloredLines(
  lines: string[],
  theme: Theme,
  color: "muted" | "error" | "toolOutput",
  width: number,
) {
  return lines.map((line) => truncateToWidth(theme.fg(color, line), width, ""));
}

function wrapped(
  text: string,
  theme: Theme,
  width: number,
  color: "muted" | "error" | "toolOutput" = "toolOutput",
) {
  // A grapheme may be wider than an extremely narrow terminal.
  return new Text(theme.fg(color, text), 0, 0)
    .render(width)
    .map((line) => truncateToWidth(line, width));
}

function resultComponent(
  result: AgentToolResult<unknown>,
  expanded: boolean,
  partial: boolean,
  isError: boolean,
  showImages: boolean,
  theme: Theme,
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
  const state = partial
    ? "running"
    : failed
      ? "failed"
      : knownHeader
        ? "completed"
        : "finished";
  const time = knownHeader ? `${knownHeader[2]}s wall` : "wall time unknown";
  const summary = ledger
    ? `${calls.length} calls · ${counts.error} error · ${counts.cancelled} cancelled · ${counts.running} running · ${counts.ok} ok${counts.unknown ? ` · ${counts.unknown} unknown` : ""}`
    : "Calls unknown (no recorded ledger)";
  return {
    render(width) {
      if (!Number.isInteger(width) || width < 1) return [];
      const rows = coloredLines(
        [`${state} · ${time}`],
        theme,
        failed ? "error" : "muted",
        width,
      );
      if (expanded) {
        if (knownHeader && first?.type === "text") {
          rows.push(
            ...wrapped(
              `Native result header\n${safe(first.text)}`,
              theme,
              width,
              "muted",
            ),
          );
        }
        rows.push(...wrapped(`Calls\n${summary}`, theme, width, "muted"));
        for (const call of calls) {
          rows.push(
            ...wrapped(
              callLine(call, true),
              theme,
              width,
              callStatus(call) === "error" ? "error" : "toolOutput",
            ),
          );
        }
        if (!calls.length)
          rows.push(
            ...wrapped("(no recorded nested calls)", theme, width, "muted"),
          );
        rows.push(...wrapped("Output", theme, width, "muted"));
        for (let index = 0; index < output.length; index++) {
          const projection = projections[index]!;
          if (projection.decoded) {
            rows.push(
              ...wrapped(
                "Display projection (outer JSON decoded)",
                theme,
                width,
                "muted",
              ),
            );
            rows.push(
              ...wrapped(
                safe(projection.text),
                theme,
                width,
                failed ? "error" : "toolOutput",
              ),
            );
            rows.push(
              ...wrapped(
                "Raw output (terminal controls stripped)",
                theme,
                width,
                "muted",
              ),
            );
          }
          rows.push(
            ...wrapped(
              safe(output[index]),
              theme,
              width,
              failed ? "error" : "toolOutput",
            ),
          );
        }
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
      } else {
        // These are nested outcomes, not the outer script's status. Separate
        // leading counts survive truncation of long summaries or tool names.
        if (counts.error)
          rows.unshift(
            ...coloredLines(
              [`✗ ${counts.error} error nested`],
              theme,
              "error",
              width,
            ),
          );
        if (counts.cancelled)
          rows.unshift(
            ...coloredLines(
              [`⊘ ${counts.cancelled} cancelled nested`],
              theme,
              "muted",
              width,
            ),
          );
        rows.push(
          ...coloredLines(
            [summary],
            theme,
            counts.error ? "error" : "muted",
            width,
          ),
        );
        const recentStart = Math.max(0, calls.length - RECENT_CALLS);
        const salient = calls
          .slice(0, recentStart)
          .filter((call) => ["error", "cancelled"].includes(callStatus(call)));
        if (salient.length) {
          rows.push(
            ...coloredLines(
              [`Earlier issues: ${salient.length}`],
              theme,
              "error",
              width,
            ),
          );
          for (const call of salient.slice(-SALIENT_CALLS)) {
            rows.push(
              ...coloredLines(
                [callLine(call, false)],
                theme,
                callStatus(call) === "error" ? "error" : "muted",
                width,
              ),
            );
          }
        }
        for (const call of calls.slice(recentStart)) {
          rows.push(
            ...coloredLines(
              [callLine(call, false)],
              theme,
              callStatus(call) === "error" ? "error" : "muted",
              width,
            ),
          );
        }
        if (partial)
          rows.push(...coloredLines(["Output pending"], theme, "muted", width));
        else if (output.length) {
          const preview = safe(
            projections
              .map((projection) => projection.text.slice(0, PREVIEW_CHARS))
              .join("\n")
              .slice(0, PREVIEW_CHARS),
          );
          rows.push(
            ...wrapped(
              preview,
              theme,
              width,
              failed ? "error" : "toolOutput",
            ).slice(0, OUTPUT_LINES),
          );
        }
        rows.push(...coloredLines([expandHint()], theme, "muted", width));
      }
      if (images)
        rows.push(
          ...coloredLines(
            [showImages ? `Images: ${images}` : `[image] × ${images}`],
            theme,
            "muted",
            width,
          ),
        );
      if (string(details?.fullOutputPath)) {
        const path = `Full output: ${expanded ? safe(details?.fullOutputPath) : inline(details?.fullOutputPath)}`;
        rows.push(
          ...(expanded
            ? wrapped(path, theme, width, "muted")
            : coloredLines([path], theme, "muted", width)),
        );
      }
      return rows;
    },
    invalidate() {},
  };
}

/** Presentation only: native executor, results, provenance and images stay Pi-owned. */
export const codemodeRenderers: CodemodeRenderers = {
  renderShell: "self",
  renderCall(args, theme, context) {
    const code = record(args)?.code;
    const lines =
      typeof code === "string" && code ? code.split(/\r?\n/u).length : 0;
    return {
      render(width) {
        if (!Number.isInteger(width) || width < 1) return [];
        const title =
          typeof code === "string"
            ? `codemode · ${lines} script lines`
            : `codemode · ${context.argsComplete ? "invalid script argument" : "receiving script"}`;
        if (context.expanded) {
          return wrapped(
            `${title}\nScript\n${typeof code === "string" ? safe(code) : "(script unavailable)"}`,
            theme,
            width,
          );
        }
        return [
          truncateToWidth(
            `${theme.fg("toolTitle", theme.bold(title))} · ${expandHint()}`,
            width,
          ),
        ];
      },
      invalidate() {},
    };
  },
  renderResult(result, options, theme, context) {
    return resultComponent(
      result,
      options.expanded,
      options.isPartial,
      context.isError,
      context.showImages,
      theme,
    );
  },
};
