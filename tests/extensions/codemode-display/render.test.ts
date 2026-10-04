import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  type AgentToolResult,
  initTheme,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  KeybindingsManager,
  setKeybindings,
  stripTerminalSequences,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { codemodeRenderers } from "../../../extensions/codemode-display/render.ts";

initTheme("dark", false);
setKeybindings(
  new KeybindingsManager({
    "app.tools.expand": {
      defaultKeys: "ctrl+o",
      description: "Toggle tool output",
    },
  }),
);
const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;
const code =
  "const result = await tools.read({path: 'secret.ts'});\nreturn result;";
function context(expanded = false, isError = false, showImages = false) {
  return {
    args: { code },
    toolCallId: "code-1",
    invalidate() {},
    lastComponent: undefined,
    state: {},
    cwd: "/workspace",
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded,
    showImages,
    isError,
  };
}
const header = "Script completed\nWall time 2.3 seconds\nOutput:\n";
function result(
  text = "done",
  calls: unknown[] = [],
): AgentToolResult<unknown> {
  return {
    content: [
      { type: "text", text: header },
      { type: "text", text },
    ],
    details: { calls },
  };
}
function rendered(
  value: AgentToolResult<unknown>,
  options: {
    expanded?: boolean;
    partial?: boolean;
    error?: boolean;
    width?: number;
    images?: boolean;
  } = {},
) {
  const expanded = options.expanded ?? false;
  return codemodeRenderers.renderResult!(
    value,
    { expanded, isPartial: options.partial ?? false },
    theme,
    context(expanded, options.error, options.images),
  )
    .render(options.width ?? 120)
    .map((row) => stripTerminalSequences(row).trimEnd());
}

test("compact call hides script and expanded call retains its complete source", () => {
  const compact = codemodeRenderers.renderCall!({ code }, theme, context())
    .render(120)
    .map(stripTerminalSequences)
    .join("\n");
  assert.match(compact, /codemode · 2 script lines/u);
  assert.match(compact, /ctrl\+o.*to expand/iu);
  assert.doesNotMatch(compact, /secret\.ts|await tools/u);
  const expanded = codemodeRenderers.renderCall!({ code }, theme, context(true))
    .render(120)
    .map((row) => stripTerminalSequences(row).trimEnd())
    .join("\n");
  assert.match(expanded, /Script/u);
  assert.ok(expanded.includes(code));
  assert.equal(codemodeRenderers.renderShell, "self");
});

test("all nested statuses include earlier failures and cancellations despite outer success", () => {
  const calls = [
    {
      name: "early-read",
      args: "PRIVATE ARGS",
      status: "error",
      error: "permission denied",
    },
    { name: "early-cancel", args: "PRIVATE ARGS", status: "cancelled" },
    ...Array.from({ length: 12 }, (_, index) => ({
      name: `read-${index}`,
      args: "PRIVATE ARGS",
      status: "ok",
      durationMs: 3,
    })),
    { name: "pending", status: "running" },
  ];
  const rows = rendered(result("done", calls));
  const text = rows.join("\n");
  assert.match(text, /completed · 2\.3s wall/u);
  assert.match(text, /15 calls · 1 error · 1 cancelled · 1 running · 12 ok/u);
  assert.match(text, /early-read error · permission denied/u);
  assert.match(text, /early-cancel cancelled/u);
  assert.match(text, /pending running/u);
  assert.doesNotMatch(text, /PRIVATE ARGS|read-0 ok/u);
  assert.ok(
    rows.length <= 15,
    "collapsed height does not grow with the ledger",
  );
  const full = rendered(result("done", calls), { expanded: true }).join("\n");
  assert.match(full, /Calls/u);
  assert.match(full, /read-0 ok/u);
  assert.match(full, /PRIVATE ARGS/u);
  assert.match(
    full,
    /Native result header\nScript completed\nWall time 2\.3 seconds\nOutput:/u,
  );
});

test("partial updates, outer errors and unknown historical evidence do not claim success", () => {
  const partial = rendered(
    result("not-final", [{ name: "read", status: "running" }]),
    { partial: true },
  ).join("\n");
  assert.match(partial, /running ·/u);
  assert.match(partial, /Output pending/u);
  assert.doesNotMatch(partial, /not-final/u);
  assert.match(
    rendered(result("failed"), { error: true }).join("\n"),
    /failed ·/u,
  );
  const unknown = rendered({
    content: [{ type: "text", text: "old raw output" }],
    details: undefined,
  }).join("\n");
  assert.match(unknown, /finished · wall time unknown/u);
  assert.match(unknown, /Calls unknown \(no recorded ledger\)/u);
  assert.doesNotMatch(unknown, /0 calls/u);
  assert.doesNotMatch(unknown, /completed|success/u);
  const fake = rendered({
    content: [
      {
        type: "text",
        text: "Script completed\nWall time 1.2.3 seconds\nOutput:\n",
      },
    ],
    details: { calls: [{ name: "future", status: "other" }] },
  }).join("\n");
  assert.match(fake, /wall time unknown/u);
  assert.match(fake, /1 unknown/u);
  assert.match(fake, /future unknown/u);
});

test("outer JSON string becomes readable text with raw evidence retained on expansion", () => {
  const raw = JSON.stringify("first line\nsecond line\nthird line");
  const compact = rendered(result(raw)).join("\n");
  assert.match(compact, /first line\nsecond line\nthird line/u);
  assert.doesNotMatch(compact, /\\n/u);
  const expanded = rendered(result(raw), { expanded: true }).join("\n");
  assert.match(expanded, /Display projection \(outer JSON decoded\)/u);
  assert.match(expanded, /Raw output \(terminal controls stripped\)/u);
  assert.ok(expanded.includes(raw));
});

test("structured JSON remains structured and nested JSON-looking strings are not interpreted", () => {
  const raw = JSON.stringify({
    content: [{ text: "literal\\ntext" }],
    output: '{"unsafe":true}',
    payload: "line1\nline2",
  });
  const expanded = rendered(result(raw), { expanded: true }).join("\n");
  assert.match(expanded, /"content": \[/u);
  assert.match(expanded, /"output": "\{\\"unsafe\\":true\}"/u);
  assert.ok(expanded.includes(raw));
  assert.doesNotMatch(expanded, /^literal\\ntext$/mu);
});

test("long output is bounded in compact view and unchanged in expanded evidence", () => {
  const raw = JSON.stringify({ value: "z".repeat(40_000) });
  const value = result(raw);
  const before = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
  const compact = rendered(value, { width: 24 });
  assert.ok(compact.length <= 7);
  assert.ok(compact.every((row) => visibleWidth(row) <= 24));
  const expanded = rendered(value, { expanded: true, width: 80 })
    .join("")
    .replace(/\s/gu, "");
  assert.ok(
    expanded.includes(raw),
    "over-budget JSON is retained raw, not partially decoded",
  );
  assert.equal(
    createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    before,
  );
});

test("external script, names, args, errors, output and evidence paths cannot issue terminal controls", () => {
  const attack = "safe\u001b[2J\u001b]52;c;clipboard\u0007\u202eevil\u009b31m";
  const value = result(attack, [
    { name: attack, args: attack, error: attack, status: "error" },
  ]);
  value.details = { ...(value.details as object), fullOutputPath: attack };
  const expanded = rendered(value, { expanded: true }).join("\n");
  assert.doesNotMatch(expanded, /\u001b|\u0007|\u202e|\u009b|clipboard/u);
  const script = codemodeRenderers.renderCall!(
    { code: attack },
    theme,
    context(true),
  )
    .render(80)
    .join("\n");
  assert.doesNotMatch(script, /\u001b|\u0007|\u202e|\u009b|clipboard/u);
  assert.match(expanded, /safeevil/u);
});

test("narrow Unicode terminals bound every compact row and image evidence remains visible", () => {
  const value = result("工作流✅".repeat(100), [
    { name: "读取🧑‍💻文件".repeat(20), status: "cancelled" },
  ]);
  value.content.push({
    type: "image",
    data: "ignored-in-text-projection",
    mimeType: "image/png",
  });
  for (const width of [1, 4, 12, 24]) {
    const rows = rendered(value, { width });
    assert.ok(
      rows.every((row) => visibleWidth(row) <= width),
      `width=${width}`,
    );
    assert.ok(rows.length <= 10);
  }
  assert.match(rendered(value).join("\n"), /\[image\] × 1/u);
  assert.match(rendered(value, { images: true }).join("\n"), /Images: 1/u);
  assert.doesNotMatch(
    rendered(value).join("\n"),
    /ignored-in-text-projection/u,
  );
});

test("expanded mode retains every call, Script/Calls/Output sections and spilled evidence path", () => {
  const calls = Array.from({ length: 20 }, (_, index) => ({
    name: `tool-${index}`,
    status: "ok",
    args: `argument-${index}`,
  }));
  const value = result("raw output", calls);
  value.details = { calls, fullOutputPath: "/tmp/full-evidence.txt" };
  const text = [
    ...codemodeRenderers.renderCall!({ code }, theme, context(true)).render(
      120,
    ),
    ...rendered(value, { expanded: true }),
  ].join("\n");
  assert.match(text, /Script/u);
  assert.match(text, /Calls/u);
  assert.match(text, /Output/u);
  assert.match(text, /argument-0/u);
  assert.match(text, /argument-19/u);
  assert.match(text, /raw output/u);
  assert.match(text, /Full output: \/tmp\/full-evidence.txt/u);
});

test("early cancellation stays identifiable at widths 1, 4 and 8 even when salient rows select later errors", () => {
  const calls = [
    { name: "first cancelled", status: "cancelled" },
    { name: "later error", status: "error" },
    { name: "latest error", status: "error" },
    ...Array.from({ length: 4 }, () => ({ name: "ok", status: "ok" })),
  ];
  for (const width of [1, 4, 8]) {
    const rows = rendered(result("done", calls), { width });
    assert.ok(
      rows.some((row) => row.startsWith("⊘")),
      `cancellation width=${width}`,
    );
    assert.ok(
      rows.some((row) => row.startsWith("✗")),
      `error width=${width}`,
    );
    assert.ok(rows.every((row) => visibleWidth(row) <= width));
  }
});
