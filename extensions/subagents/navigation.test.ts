import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type TUI } from "@earendil-works/pi-tui";
import { BelowEditorStripState } from "../shared/below-editor-navigation.ts";
import {
  normalizeSubagentTitle,
  selectSubagentStripEntry,
  type SubagentStripEntry,
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

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const SPINNERS = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/;

function stripWidget(entry: SubagentStripEntry | undefined) {
  const strip = new BelowEditorStripState();
  const widget = new SubagentStripWidget(
    { requestRender() {} } as unknown as TUI,
    theme,
    strip,
    () => entry,
  );
  return { strip, widget };
}

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
  const entry = selectSubagentStripEntry(
    [snapshot("sa-1", "running", Date.now() - 2_000)],
    0,
  );
  const { strip, widget } = stripWidget(entry);
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

    for (const width of [1, 8, 20, 40]) {
      const narrow = widget.render(width);
      assert.equal(narrow.length, 1);
      assert.ok(visibleWidth(narrow[0]!) <= width);
    }
  } finally {
    widget.dispose();
  }
});

test("unfocused strip shows exactly one leading glyph: spinner or settle mark", () => {
  const running = stripWidget(
    selectSubagentStripEntry([snapshot("sa-1", "running", Date.now())], 0),
  );
  try {
    const line = running.widget.render(100)[0]!;
    assert.match(line, /^ [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] /);
    assert.doesNotMatch(line, /■|○|❯|✓|✗/);
  } finally {
    running.widget.dispose();
  }

  const done = stripWidget(
    selectSubagentStripEntry([snapshot("sa-2", "done", 1, 2)], 0),
  );
  try {
    const line = done.widget.render(100)[0]!;
    assert.match(line, /✓/);
    assert.doesNotMatch(line, SPINNERS);
    assert.doesNotMatch(line, /■|○|❯|✗/);
  } finally {
    done.widget.dispose();
  }

  const failed = stripWidget(
    selectSubagentStripEntry([snapshot("sa-3", "error", 1, 2)], 0),
  );
  try {
    const line = failed.widget.render(100)[0]!;
    assert.match(line, /✗/);
    assert.doesNotMatch(line, SPINNERS);
    assert.doesNotMatch(line, /■|○|❯|✓/);
  } finally {
    failed.widget.dispose();
  }
});

test("focused strip shows the marker and no status glyph", () => {
  const { strip, widget } = stripWidget(
    selectSubagentStripEntry([snapshot("sa-1", "running", Date.now())], 0),
  );
  strip.focused = true;
  try {
    const line = widget.render(100)[0]!;
    assert.match(line, /❯/);
    assert.doesNotMatch(line, SPINNERS);
    assert.doesNotMatch(line, /■|○|✓|✗/);
  } finally {
    widget.dispose();
  }
});

test("strip carries no model label and no context percentage", () => {
  const { widget } = stripWidget(
    selectSubagentStripEntry(
      [snapshot("sa-1", "running", Date.now(), undefined)],
      0,
    ),
  );
  try {
    const line = widget.render(100)[0]!;
    assert.doesNotMatch(line, /gpt-5\.6-sol/);
    assert.doesNotMatch(line, /%/);
  } finally {
    widget.dispose();
  }
});

test("a single subagent shows no count; several show a readable one", () => {
  const single = stripWidget(
    selectSubagentStripEntry([snapshot("solo", "running", 3)], 0),
  );
  try {
    const line = single.widget.render(100)[0]!;
    assert.doesNotMatch(line, /agents/);
    assert.doesNotMatch(line, /\d\/\d/);
  } finally {
    single.widget.dispose();
  }

  const entry = selectSubagentStripEntry(
    [
      snapshot("done-1", "done", 1, 5),
      snapshot("done-2", "done", 2, 6),
      snapshot("run", "running", 3),
    ],
    0,
  );
  const several = stripWidget(entry);
  try {
    const line = several.widget.render(100)[0]!;
    assert.match(line, /2\/3 done/);
    assert.doesNotMatch(line, /agents/);
  } finally {
    several.widget.dispose();
  }
});
