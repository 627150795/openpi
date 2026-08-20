/**
 * Fold very long user messages in the transcript display.
 *
 * A pasted log, stack trace, or whole file can wipe out several screens of
 * chat. When a finalized user message exceeds the fold thresholds, the
 * display keeps a short preview of the prose and of each fenced code block
 * and closes with a marker line stating how much was folded.
 *
 * This is display-only. The transformer runs through Pi's
 * `registerMarkdownTransformer` hook, which changes only what the TUI
 * renders: the session file and the model context keep the full message
 * untouched, so the model always receives the complete paste. The pure
 * `foldUserMessage` helper never mutates its input and has no side effects.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Fold a user message longer than this many lines. */
const MAX_LINES = 20;
/** Fold a user message longer than this many characters. */
const MAX_CHARS = 1_200;
/** Prose lines kept when a message is folded. */
const PROSE_PREVIEW_LINES = 12;
/** Content lines kept per fenced code block when a message is folded. */
const BLOCK_PREVIEW_LINES = 4;
/** Character budget for the prose part of a folded message. */
const PROSE_PREVIEW_CHARS = 1_200;

type Segment =
  | { kind: "prose"; lines: string[] }
  | { kind: "code"; open: string; content: string[]; close: string };

const FENCE_OPEN = /^ {0,3}`{3,}/;
const FENCE_CLOSE = /^ {0,3}`{3,}[ \t]*$/;

function countLines(markdown: string): number {
  const parts = markdown.split("\n");
  // A trailing newline ends the last line; it does not open a new one.
  return parts.at(-1) === "" ? parts.length - 1 : parts.length;
}

function splitLines(markdown: string): string[] {
  const lines = markdown.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function parseSegments(lines: string[]): Segment[] {
  const segments: Segment[] = [];
  let prose: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!FENCE_OPEN.test(lines[i])) {
      prose.push(lines[i]);
      i += 1;
      continue;
    }
    if (prose.length > 0) {
      segments.push({ kind: "prose", lines: prose });
      prose = [];
    }
    const open = lines[i];
    const content: string[] = [];
    let close: string | undefined;
    let j = i + 1;
    while (j < lines.length && close === undefined) {
      if (FENCE_CLOSE.test(lines[j])) close = lines[j];
      else content.push(lines[j]);
      j += 1;
    }
    if (close === undefined) {
      // Unterminated fence: fold the whole message conservatively as text.
      return [{ kind: "prose", lines }];
    }
    segments.push({ kind: "code", open, content, close });
    i = j;
  }
  if (prose.length > 0) segments.push({ kind: "prose", lines: prose });
  return segments;
}

/**
 * Return the Markdown Pi should render instead of a long user message.
 * Messages at or below both thresholds are returned unchanged. Pure: the
 * input string is never modified, and the model still sees the original.
 */
export function foldUserMessage(markdown: string): string {
  const totalLines = countLines(markdown);
  if (totalLines <= MAX_LINES && markdown.length <= MAX_CHARS) return markdown;

  const preview: string[] = [];
  let proseLinesLeft = PROSE_PREVIEW_LINES;
  let proseCharsLeft = PROSE_PREVIEW_CHARS;
  let linesShown = 0;

  for (const segment of parseSegments(splitLines(markdown))) {
    if (segment.kind === "code") {
      const shown = Math.min(segment.content.length, BLOCK_PREVIEW_LINES);
      preview.push(segment.open, ...segment.content.slice(0, shown));
      if (shown < segment.content.length) preview.push("…");
      preview.push(segment.close);
      linesShown += 2 + shown;
      continue;
    }
    for (const line of segment.lines) {
      if (proseLinesLeft <= 0) break;
      const cost = line.length + (preview.length > 0 ? 1 : 0);
      if (preview.length > 0 && cost > proseCharsLeft) break;
      if (preview.length === 0 && line.length > proseCharsLeft) {
        // A single giant first line is the only case that cuts mid-line.
        preview.push(`${line.slice(0, proseCharsLeft)}…`);
        proseLinesLeft = 0;
        proseCharsLeft = 0;
        break;
      }
      preview.push(line);
      linesShown += 1;
      proseLinesLeft -= 1;
      proseCharsLeft -= cost;
    }
  }

  const foldedLines = totalLines - linesShown;
  if (foldedLines <= 0) {
    // Everything already fits the preview budgets; showing it all is honest.
    return markdown;
  }
  const noun = foldedLines === 1 ? "line" : "lines";
  preview.push(
    `… folded ${foldedLines} ${noun} · full content was sent to the model`,
  );
  return preview.join("\n");
}

/**
 * The registered transformer: fold only finalized user messages and leave
 * assistant text, thinking blocks, and streaming updates untouched.
 */
export function transformUserMarkdown(
  markdown: string,
  context: { messageType: string; isStreaming: boolean },
): string {
  if (context.messageType !== "user" || context.isStreaming) return markdown;
  try {
    return foldUserMessage(markdown);
  } catch {
    // Display-only: a folding bug must never break rendering.
    return markdown;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerMarkdownTransformer(transformUserMarkdown);
}
