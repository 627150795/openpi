import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type TUI } from "@earendil-works/pi-tui";
import { BelowEditorStripState } from "../shared/below-editor-navigation.ts";
import {
  normalizeSubagentTitle,
  selectSubagentStripEntry,
  SubagentStripWidget,
} from "./navigation.ts";
import type { SubagentSnapshot } from "./src/domain.ts";

function snapshot(
  id: string,
  status: SubagentSnapshot["status"],
  createdAt: number,
  settledAt?: number,
): SubagentSnapshot {
  return {
    id,
    origin: "model",
    backend: "pi",
    title: `${id}\u001b]52;c;payload\u0007`,
    prompt: "inspect",
    cwd: "/repo",
    status,
    createdAt,
    ...(settledAt === undefined ? {} : { settledAt }),
    meta: { backend: "pi", modelLabel: "openai-codex/gpt-5.6-sol" },
    usage: { tokens: 1_000, contextWindow: 10_000 },
    transcript: [],
    liveTools: [],
    queued: [],
    finalText: "",
    turns: 0,
  };
}

const markingTheme = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bold: (text: string) => text,
} as unknown as Theme;

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

test("subagent titles are sanitized and bounded at ingress", () => {
  assert.equal(
    normalizeSubagentTitle(" review\u001b]52;c;payload\u0007\nnow "),
    "review now",
  );
  assert.equal(normalizeSubagentTitle("\u001b[31m\u001b[0m"), "subagent");
  assert.equal(normalizeSubagentTitle("x".repeat(200)).length, 160);
});

test("strip selection prefers newest running, then newest unread settled", () => {
  const entries = [
    snapshot("done", "done", 1, 5),
    snapshot("running-old", "running", 2),
    snapshot("running-new", "running", 3),
  ];
  assert.equal(
    selectSubagentStripEntry(entries, 0)?.snapshot.id,
    "running-new",
  );
  assert.equal(
    selectSubagentStripEntry(
      [snapshot("old", "done", 1, 5), snapshot("new", "error", 2, 8)],
      6,
    )?.snapshot.id,
    "new",
  );
  assert.equal(
    selectSubagentStripEntry([snapshot("old", "done", 1, 5)], 6),
    undefined,
  );
});

test("subagent strip matches Workflow's bounded one-line affordance", () => {
  const strip = new BelowEditorStripState();
  const entry = selectSubagentStripEntry(
    [snapshot("sa-1", "running", Date.now() - 2_000)],
    0,
  );
  const widget = new SubagentStripWidget(
    { requestRender() {} } as unknown as TUI,
    theme,
    strip,
    () => entry,
  );
  try {
    const idle = widget.render(100);
    assert.equal(idle.length, 1);
    assert.match(idle[0]!, /sa-1/);
    assert.doesNotMatch(idle[0]!, /payload/);
    assert.match(idle[0]!, /↓ to manage/);

    strip.focused = true;
    const focused = widget.render(54);
    assert.equal(focused.length, 1);
    assert.ok(visibleWidth(focused[0]!) <= 54);
    assert.match(focused[0]!, /enter open/);

    for (const width of [1, 8, 20]) {
      const narrow = widget.render(width);
      assert.equal(narrow.length, 1);
      assert.ok(visibleWidth(narrow[0]!) <= width);
    }
  } finally {
    widget.dispose();
  }
});

test("the metrics tail stays quiet while a run is healthy", () => {
  const strip = new BelowEditorStripState();
  const render = (status: SubagentSnapshot["status"]) => {
    const entry = selectSubagentStripEntry(
      [
        snapshot(
          "sa-1",
          status,
          Date.now() - 2_000,
          status === "running" ? undefined : Date.now(),
        ),
      ],
      0,
    );
    const widget = new SubagentStripWidget(
      { requestRender() {} } as unknown as TUI,
      markingTheme,
      strip,
      () => entry,
    );
    try {
      return widget.render(400)[0]!;
    } finally {
      widget.dispose();
    }
  };

  // A routine run borrows no status colour in its tail: the coloured glyph on
  // the left already carries the state, and hints recede furthest of all.
  const running = render("running");
  assert.match(running, /<muted>1 running<\/muted>/);
  assert.match(running, /<dim>↓ to manage<\/dim>/);
  assert.doesNotMatch(running, /<warning>1 running/);

  // Once settled, the one count that carries the outcome takes the colour.
  assert.match(render("error"), /<error>1 failed<\/error>/);
  assert.match(render("done"), /<success>1 done<\/success>/);
});
