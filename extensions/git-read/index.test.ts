import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { Cause, Effect, Exit } from "effect";
import { buildLogArgs, buildShowArgs } from "./src/args.ts";
import { runGit } from "./src/process.ts";

/** Create a small real repository with two commits and a dirty worktree. */
function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-git-read-"));
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  git(["init", "--quiet"]);
  git(["config", "user.email", "t@example.com"]);
  git(["config", "user.name", "T"]);
  writeFileSync(join(dir, "a.txt"), "one\n");
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "first"]);
  writeFileSync(join(dir, "a.txt"), "one\ntwo\n");
  writeFileSync(join(dir, "b.txt"), "new\n");
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "second"]);
  writeFileSync(join(dir, "a.txt"), "one\ntwo\nthree\n");
  return dir;
}

let repo: string;

before(() => {
  repo = makeRepo();
});

after(() => {
  rmSync(repo, { recursive: true, force: true });
});

test("runGit returns stdout for a successful command", async () => {
  const exit = await Effect.runPromiseExit(runGit(buildLogArgs({}), repo));
  assert.ok(Exit.isSuccess(exit));
  if (Exit.isSuccess(exit)) {
    assert.match(exit.value.output.preview, /second/);
    assert.match(exit.value.output.preview, /first/);
    assert.equal(exit.value.exitCode, 0);
  }
});

test("runGit surfaces git failures as GitCommandError with stderr", async () => {
  const exit = await Effect.runPromiseExit(
    runGit(["show", "--no-color", "does-not-exist"], repo),
  );
  assert.ok(Exit.isFailure(exit));
  if (Exit.isFailure(exit)) {
    const error = Cause.squash(exit.cause) as { message?: string };
    assert.match(
      error.message ?? "",
      /does-not-exist|bad revision|unknown revision|ambiguous argument/i,
    );
  }
});

test("git show output includes commit metadata and patch", async () => {
  const exit = await Effect.runPromiseExit(
    runGit(buildShowArgs({ revision: "HEAD" }), repo),
  );
  assert.ok(Exit.isSuccess(exit));
  if (Exit.isSuccess(exit)) {
    assert.match(exit.value.output.preview, /second/);
    assert.match(exit.value.output.preview, /\+new/);
  }
});

test("git show with path prints the file content at the revision", async () => {
  const exit = await Effect.runPromiseExit(
    runGit(buildShowArgs({ revision: "HEAD", path: "b.txt" }), repo),
  );
  assert.ok(Exit.isSuccess(exit));
  if (Exit.isSuccess(exit)) {
    assert.match(exit.value.output.preview, /new/);
  }
});

test("git diff of the dirty worktree shows unstaged changes", async () => {
  const exit = await Effect.runPromiseExit(
    runGit(["diff", "--no-color"], repo),
  );
  assert.ok(Exit.isSuccess(exit));
  if (Exit.isSuccess(exit)) {
    assert.match(exit.value.output.preview, /\+three/);
  }
});

test("outside a repository the command fails with a clear error", async () => {
  const outside = mkdtempSync(join(tmpdir(), "pi-git-none-"));
  try {
    const exit = await Effect.runPromiseExit(runGit(["log"], outside));
    assert.ok(Exit.isFailure(exit));
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
