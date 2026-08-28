import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROW_PATTERN =
  /^\|\s*(OP-\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(yes|no)\s*\|\s*`([^`]+)`\s*\|\s*$/i;

export function parseLedger(source) {
  return source
    .split(/\r?\n/)
    .map((line) => ROW_PATTERN.exec(line))
    .filter(Boolean)
    .map((match) => ({
      id: match[1],
      promise: match[2].trim(),
      status: match[3].trim(),
      ci: match[4].toLowerCase(),
      check: match[5].trim(),
    }));
}

function hasShellCommand(source, command) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^\\s*|&&|\\|\\||;|\\||\\()\\s*${escaped}(?=\\s|$)`,
    "i",
  ).test(source);
}

function hasWorkflowCommand(source, command) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^\\s*|\\brun:\\s*)${escaped}(?=\\s|$)`, "i");
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, ""))
    .some((line) => pattern.test(line));
}

function scriptIsWired(name, scripts, workflows, visiting = new Set()) {
  const command = `bun run ${name}`;
  if (hasWorkflowCommand(workflows, command)) return true;
  if (visiting.has(name)) return false;
  visiting.add(name);
  return Object.entries(scripts).some(([candidate, body]) => {
    if (!hasShellCommand(body, command)) return false;
    return scriptIsWired(candidate, scripts, workflows, visiting);
  });
}

function checkLedger({ ledgerSource, packageSource, workflowSource }) {
  const problems = [];
  if (!ledgerSource.includes("append-only")) {
    problems.push("ledger must declare its append-only policy");
  }
  const rows = parseLedger(ledgerSource);
  if (rows.length === 0) problems.push("ledger has no OP rows");
  const malformedRows = ledgerSource
    .split(/\r?\n/)
    .filter(
      (line) => /^\s*\|\s*OP-\d+\b/i.test(line) && !ROW_PATTERN.test(line),
    );
  if (malformedRows.length > 0) {
    problems.push("ledger contains malformed OP rows");
  }

  const manifest = JSON.parse(packageSource);
  const scripts = manifest.scripts ?? {};
  rows.forEach((row, index) => {
    const expected = `OP-${String(index + 1).padStart(2, "0")}`;
    if (row.id !== expected) {
      problems.push(
        `${row.id} breaks append-only sequence; expected ${expected}`,
      );
    }

    const command = /^bun run ([a-z0-9:_-]+)$/i.exec(row.check);
    if (!command || !scripts[command[1]]) {
      problems.push(`${row.id} references an unknown check: ${row.check}`);
    } else if (
      row.ci === "yes" &&
      !scriptIsWired(command[1], scripts, workflowSource)
    ) {
      problems.push(`${row.id} is marked CI=yes but is not wired into CI`);
    }
  });

  return { rows, problems };
}

export function assertLedger(input) {
  const result = checkLedger(input);
  if (result.problems.length > 0) {
    throw new Error(
      [
        "Discipline ledger check failed:",
        ...result.problems.map((problem) => `- ${problem}`),
      ].join("\n"),
    );
  }
  return result;
}

const read = (path) => readFileSync(resolve(ROOT, path), "utf8");
const result = assertLedger({
  ledgerSource: read("docs/disciplines.md"),
  packageSource: read("package.json"),
  workflowSource: read(".github/workflows/ci.yml"),
});
process.stdout.write(
  `✓ discipline ledger (${result.rows.length} append-only rows)\n`,
);
