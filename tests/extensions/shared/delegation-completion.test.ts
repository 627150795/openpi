import assert from "node:assert/strict";
import test from "node:test";
import { projectDelegationCompletion } from "../../../extensions/shared/delegation-completion.ts";

const facts = {
  owner: "direct" as const,
  executionId: "sa-1:run:1",
  outcome: "success" as const,
  evidenceRef: "child-session.jsonl",
  effectiveCwd: "/shared",
  isolation: "shared" as const,
  tools: [{ callId: "tool-1", name: "bash", isError: false }],
  textRef: "child-session.jsonl#assistant",
};

test("completion separates tool returns and model claims from verification/process exit", () => {
  const receipt = projectDelegationCompletion(facts);
  assert.equal(receipt.observed.outcome, "success");
  assert.equal(receipt.observed.tools.items[0]?.returned, "success");
  assert.equal(receipt.observed.tools.items[0]?.processExit.status, "unknown");
  assert.equal(receipt.verification.status, "unknown");
  assert.equal(receipt.verification.automatic.status, "not-run");
  assert.equal(receipt.workspace.attribution, "unknown");
  assert.equal(receipt.modelClaimed.textRef, facts.textRef);
  assert.equal(JSON.stringify(receipt).includes("tests passed"), false);
});

test("completion remains bounded and marks partial tool coverage", () => {
  const receipt = projectDelegationCompletion({
    ...facts,
    tools: Array.from({ length: 40 }, (_, index) => ({
      callId: `tool-${index}`,
      name: "bash",
      isError: false,
    })),
  });
  assert.equal(receipt.observed.tools.items.length, 16);
  assert.equal(receipt.observed.tools.omitted, 24);
  assert.equal(receipt.observed.tools.coverage, "partial");
});

test("replay does not invent an original execution; isolated evidence is not exclusive authorship", () => {
  const receipt = projectDelegationCompletion({
    ...facts,
    owner: "workflow",
    outcome: "replayed",
    replay: { origin: "unknown" },
    isolation: "worktree",
    handoffRef: "worktree-handoff.json",
    persistence: "failed",
  });
  assert.equal(receipt.replay?.newExecution, false);
  assert.equal(receipt.replay?.origin, "unknown");
  assert.equal(receipt.workspace.attribution, "checkout-only");
  assert.equal(receipt.workspace.handoffRef, "worktree-handoff.json");
  assert.equal(receipt.persistence.status, "failed");
});

test("oversized references become unavailable, not fabricated truncated paths", () => {
  const huge = "x".repeat(100_000);
  const receipt = projectDelegationCompletion({
    ...facts,
    evidenceRef: huge,
    executionId: huge,
    textRef: huge,
    tools: Array.from({ length: 100 }, () => ({
      callId: huge,
      name: huge,
      isError: false,
    })),
    replay: { origin: { executionId: huge, evidenceRef: huge } },
  });
  assert.equal(receipt.identity.executionId, "unknown");
  assert.equal(receipt.observed.evidenceRef, undefined);
  assert.equal(receipt.modelClaimed.status, "unknown");
  assert.equal(receipt.replay?.origin, "unknown");
  assert.ok(Buffer.byteLength(JSON.stringify(receipt), "utf8") < 16 * 1024);
});

for (const outcome of ["failure", "cancelled", "uncertain"] as const) {
  test(`completion preserves ${outcome} without acceptance judgment`, () => {
    assert.equal(
      projectDelegationCompletion({ ...facts, outcome }).observed.outcome,
      outcome,
    );
  });
}
