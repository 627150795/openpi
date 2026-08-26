import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const trackedPaths = new Set(
  execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean),
);

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const target = absolute(relativePath);
  if (!existsSync(target)) {
    errors.push(`missing required file: ${relativePath}`);
    return "";
  }
  return readFileSync(target, "utf8");
}

function parseFrontmatter(relativePath, content) {
  if (!content.startsWith("---\n")) {
    errors.push(`missing frontmatter: ${relativePath}`);
    return new Map();
  }
  const end = content.indexOf("\n---", 4);
  if (end < 0) {
    errors.push(`unterminated frontmatter: ${relativePath}`);
    return new Map();
  }
  const fields = new Map();
  for (const line of content.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    fields.set(
      line.slice(0, separator).trim(),
      line.slice(separator + 1).trim(),
    );
  }
  return fields;
}

function requireFields(relativePath, fields, names) {
  for (const name of names) {
    if (!fields.get(name))
      errors.push(`${relativePath}: missing metadata ${name}`);
  }
}

function linkTargets(content) {
  return new Set(
    [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) =>
      match[1].trim(),
    ),
  );
}

function isTrackedTarget(target) {
  const relativePath = path.relative(root, target);
  return (
    trackedPaths.has(relativePath) ||
    [...trackedPaths].some((candidate) =>
      candidate.startsWith(`${relativePath}${path.sep}`),
    )
  );
}

function checkLinks(relativePath, content) {
  const source = absolute(relativePath);
  for (const target of linkTargets(content)) {
    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }
    const fileTarget = target.split("#", 1)[0].split("?", 1)[0];
    const resolved = path.resolve(path.dirname(source), fileTarget);
    if (!existsSync(resolved))
      errors.push(`${relativePath}: broken link ${target}`);
    else if (!isTrackedTarget(resolved))
      errors.push(
        `${relativePath}: link is not available in a clean checkout: ${target}`,
      );
  }
}

const navigation = [
  {
    index: "docs/README.md",
    targets: [
      { link: "research/", file: "docs/research/README.md" },
      { link: "design/", file: "docs/design/README.md" },
      { link: "decisions/", file: "docs/decisions/README.md" },
      { link: "architecture/", file: "docs/architecture/README.md" },
      { link: "benchmarks/", file: "docs/benchmarks/README.md" },
    ],
  },
  {
    index: "docs/research/README.md",
    targets: [
      {
        link: "CLAUDE_CODE_WORKFLOW_FANOUT_POLICY_2026-08-23.md",
        file: "docs/research/CLAUDE_CODE_WORKFLOW_FANOUT_POLICY_2026-08-23.md",
      },
      {
        link: "OPENPI_KNOWLEDGE_ASSET_RESEARCH_2026-08-26.md",
        file: "docs/research/OPENPI_KNOWLEDGE_ASSET_RESEARCH_2026-08-26.md",
      },
    ],
  },
  {
    index: "docs/decisions/README.md",
    targets: [{ link: "TEMPLATE.md", file: "docs/decisions/TEMPLATE.md" }],
  },
  {
    index: "docs/benchmarks/README.md",
    targets: [
      {
        link: "runs/2026-08-26-openai-luna-high-pi-vs-openpi.md",
        file: "docs/benchmarks/runs/2026-08-26-openai-luna-high-pi-vs-openpi.md",
      },
      {
        link: "BENCHMARK_RESULT_TEMPLATE.md",
        file: "docs/benchmarks/BENCHMARK_RESULT_TEMPLATE.md",
      },
      {
        link: "PI_OPENPI_BENCHMARK_PROTOCOL.md",
        file: "docs/benchmarks/PI_OPENPI_BENCHMARK_PROTOCOL.md",
      },
      {
        link: "evidence/2026-08-26-openai-luna-high-manifest.sha256",
        file: "docs/benchmarks/evidence/2026-08-26-openai-luna-high-manifest.sha256",
      },
    ],
  },
];

const canonicalFiles = [
  ...new Set(
    navigation.flatMap(({ index, targets }) => [
      index,
      ...targets.map(({ file }) => file),
    ]),
  ),
];

for (const { index, targets } of navigation) {
  const links = linkTargets(read(index));
  for (const { link } of targets) {
    if (!links.has(link))
      errors.push(`${index}: canonical target is not reachable: ${link}`);
  }
}

const privateValuePattern =
  /\/Users\/|\/private\/var\/|(?:^|[\s"'`])(?:sk-|ghp-)[A-Za-z0-9]|Bearer\s+[A-Za-z0-9]/im;
for (const relativePath of canonicalFiles) {
  const content = read(relativePath);
  if (!trackedPaths.has(relativePath))
    errors.push(`${relativePath}: canonical file is not tracked by Git`);
  if (content) checkLinks(relativePath, content);
  if (privateValuePattern.test(content))
    errors.push(
      `${relativePath}: contains a private path or credential-like value`,
    );
}

const governedRecords = [
  "docs/research/OPENPI_KNOWLEDGE_ASSET_RESEARCH_2026-08-26.md",
  "docs/research/CLAUDE_CODE_WORKFLOW_FANOUT_POLICY_2026-08-23.md",
  "docs/benchmarks/runs/2026-08-26-openai-luna-high-pi-vs-openpi.md",
];
const allowedStatuses = new Set(["draft", "validated", "superseded"]);
for (const relativePath of governedRecords) {
  const fields = parseFrontmatter(relativePath, read(relativePath));
  requireFields(relativePath, fields, [
    "status",
    "created",
    "last-verified",
    "applies-to",
    "related-issues",
    "related-prs",
    "supersedes",
  ]);
  if (!allowedStatuses.has(fields.get("status")))
    errors.push(`${relativePath}: invalid document status`);
  for (const field of ["created", "last-verified"]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.get(field) ?? ""))
      errors.push(`${relativePath}: invalid ${field} date`);
  }
}

const reportPath =
  "docs/benchmarks/runs/2026-08-26-openai-luna-high-pi-vs-openpi.md";
const report = read(reportPath);
const reportFields = parseFrontmatter(reportPath, report);
requireFields(reportPath, reportFields, [
  "provider-model",
  "thinking",
  "task-source",
  "verifier",
  "sample-size",
  "isolation",
  "failure-classification",
  "evidence-manifest",
  "raw-evidence",
  "archive-files",
  "archive-logical-bytes",
  "archive-manifest-sha256",
]);
for (const heading of [
  "## Scope and conclusion",
  "## Frozen contract",
  "## Evidence and archive",
  "## Reproduction entry point",
  "## Failure classification",
  "## Evidence boundary and limitations",
]) {
  if (!report.includes(heading))
    errors.push(`${reportPath}: missing section ${heading}`);
}

const manifest = read(
  "docs/benchmarks/evidence/2026-08-26-openai-luna-high-manifest.sha256",
);
const manifestLines = manifest
  .split("\n")
  .filter((line) => line && !line.startsWith("#"));
if (
  manifestLines.length !== 6 ||
  manifestLines.some((line) => !/^[a-f0-9]{64} {2}\S+$/.test(line))
) {
  errors.push("Benchmark evidence manifest must contain six SHA-256 entries");
}

const agents = read("AGENTS.md");
if (
  !agents.includes("### Knowledge and evidence") ||
  !agents.includes("docs/README.md")
) {
  errors.push(
    "AGENTS.md: missing compact Knowledge and evidence contract pointer",
  );
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `docs-contract: passed (${canonicalFiles.length} canonical files, ${manifestLines.length} evidence entries)`,
  );
}
