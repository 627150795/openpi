import { createHash } from "node:crypto";
import { projectDelegationCompletion } from "../../shared/delegation-completion.ts";
import type { SubagentSnapshot } from "./domain.ts";

// Fingerprints correlate evidence across projections without disclosing host paths.
// Canonical paths stay with the Pi session / structured-result owner; these are
// identifiers, not filesystem locators or grants of access to private evidence.
function evidenceReference(kind: "session" | "artifact", filePath?: string) {
  return filePath
    ? `pi-${kind}:${createHash("sha256").update(filePath).digest("hex")}`
    : undefined;
}

export function subagentCompletion(snap: SubagentSnapshot) {
  const retainedStart = snap.transcriptVersion - snap.transcript.length;
  const runTranscript =
    snap.runTranscriptStart === undefined
      ? []
      : snap.transcript.slice(
          Math.max(0, snap.runTranscriptStart - retainedStart),
        );
  const evidenceRef = evidenceReference("session", snap.meta.sessionFilePath);
  return projectDelegationCompletion({
    owner: "direct",
    executionId:
      snap.runGeneration === undefined
        ? undefined
        : `${snap.id}:run:${snap.runGeneration}`,
    outcome: snap.executionUncertain
      ? "uncertain"
      : snap.status === "running"
        ? "running"
        : snap.outcome === "completed"
          ? "success"
          : snap.outcome === "failed"
            ? "failure"
            : snap.outcome === "interrupted"
              ? "cancelled"
              : "uncertain",
    evidenceRef,
    tools: runTranscript.flatMap((item) =>
      item.kind === "toolResult"
        ? [{ callId: item.toolId, name: item.name, isError: item.isError }]
        : [],
    ),
    textRef:
      snap.status !== "running" && snap.finalText ? evidenceRef : undefined,
    structuredRef: evidenceReference(
      "artifact",
      snap.structuredResult?.artifactPath,
    ),
    persistence: snap.structuredResult ? "saved" : "unknown",
    effectiveCwd: snap.cwd,
    requestedCwd: snap.requestedCwd,
    isolation: snap.worktreeBranch ? "worktree" : "shared",
    branch: snap.worktreeBranch,
    baseSha: snap.worktreeBaseSha,
  });
}
