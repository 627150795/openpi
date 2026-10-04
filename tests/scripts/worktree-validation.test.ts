import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const source = resolve(".");
const dependencies = realpathSync(resolve("node_modules"));

// Exercise real Git worktrees, real tool discovery and sibling module imports;
// a config-shape assertion alone misses the absolute-path deny failure (#663).
test("validation works inside and outside Git metadata without exposing private files", {
  timeout: 90_000,
}, () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "openpi-validation-")),
  );
  const repository = join(directory, "repository");
  const run = (cwd: string, command: string, args: string[]) => {
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return result.stdout;
  };
  try {
    mkdirSync(repository);
    run(repository, "git", ["init", "--quiet"]);
    for (const folder of ["tests/web", "web/ui/src"]) {
      mkdirSync(join(repository, folder), { recursive: true });
    }
    for (const config of ["biome.json", "vitest.config.mjs"]) {
      copyFileSync(join(source, config), join(repository, config));
    }
    writeFileSync(
      join(repository, "package.json"),
      JSON.stringify({ type: "module", devDependencies: { react: "19.2.8" } }),
    );
    writeFileSync(
      join(repository, "web/ui/src/value.ts"),
      "export const value = 42;\n",
    );
    writeFileSync(
      join(repository, "web/ui/src/component.tsx"),
      `export const Component = ({ items }: { items: string[] }) => items.map((item, index) => (\n  // biome-ignore lint/suspicious/noArrayIndexKey: immutable fixture coordinates\n  <span key={index}>{item}</span>\n));\n`,
    );
    writeFileSync(
      join(repository, "tests/web/value.spec.ts"),
      `// @vitest-environment jsdom\nimport { expect, it } from "vitest";\nimport { value } from "../../web/ui/src/value";\nit("loads a sibling source module", () => expect(value).toBe(42));\n`,
    );
    run(repository, "git", ["add", "."]);
    run(repository, "git", [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ]);
    for (const root of [
      join(repository, ".git/pi-worktrees/inside"),
      join(directory, "outside"),
    ]) {
      run(repository, "git", [
        "worktree",
        "add",
        "--quiet",
        "--detach",
        root,
        "HEAD",
      ]);
      symlinkSync(
        dependencies,
        join(root, "node_modules"),
        process.platform === "win32" ? "junction" : "dir",
      );
      run(root, process.execPath, [
        join(dependencies, "@biomejs/biome/bin/biome"),
        "lint",
        ".",
        "--error-on-warnings",
      ]);
      run(root, process.execPath, [
        join(dependencies, "vitest/vitest.mjs"),
        "run",
        "tests/web/value.spec.ts",
      ]);
      run(root, process.execPath, [
        "--input-type=module",
        "-e",
        `
        import assert from "node:assert/strict";
        import { createServer } from "vite";
        import { resolve } from "node:path";
        const server = await createServer({ configFile: "vitest.config.mjs", server: { middlewareMode: true } });
        try {
          assert.equal(server.config.server.fs.strict, true);
          assert.equal(server.config.fsDenyGlob(resolve("web/ui/src/value.ts")), false);
          for (const file of [".git", ".GIT", ".git/config", "web/.git/config", "web/.GIT/config", ".env", "web/.env.local", ".npmrc", ".yarnrc.yml", "web/private.pem", "web/private.key", "web/private.crt", "web/private.p12", "web/private.pfx", "web/private.cer", "web/private.der"]) {
            assert.equal(server.config.fsDenyGlob(resolve(file)), true, file);
          }
          assert.equal(server.config.fsDenyGlob(${JSON.stringify(join(repository, ".git/config"))}), true);
        } finally { await server.close(); }
      `,
      ]);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
