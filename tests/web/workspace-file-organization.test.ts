import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { ArtifactReader } from "../../web/host/artifacts.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "openpi-file-organization-"));
  const cwd = join(root, "workspace");
  await mkdir(cwd);
  let scope = { sessionId: "s", sessionPath: "/sessions/one", cwd };
  const reader = new ArtifactReader(() => scope);
  const identity = async (path: string) => {
    const parts = path.split("/");
    const name = parts.pop();
    const result = await reader.listFiles(
      "s",
      encodeURI(parts.join("/") || "."),
      "",
      scope.sessionPath,
    );
    const entry = result.entries.find((entry) => entry.name === name);
    assert.ok(entry?.identity);
    return entry.identity;
  };
  return {
    root,
    cwd,
    reader,
    identity,
    get scope() {
      return scope;
    },
    setScope(value: typeof scope) {
      scope = value;
    },
    async cleanup() {
      reader.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("file organization renames binary originals, moves full directories and never overwrites an existing name", async () => {
  const f = await fixture();
  try {
    const bytes = Buffer.from([0, 255, 19, 0, 83]);
    await writeFile(join(f.cwd, "原 %20.bin"), bytes);
    await mkdir(join(f.cwd, "folder"));
    await mkdir(join(f.cwd, "destination"));
    await writeFile(join(f.cwd, "folder", "nested.txt"), "nested original");
    const moved = await f.reader.mutateFile("s", f.scope.sessionPath, {
      kind: "move",
      path: encodeURI("原 %20.bin"),
      identity: await f.identity("原 %20.bin"),
      directory: "destination",
      name: "改名.bin",
    });
    assert.equal(moved.path, "destination/改名.bin");
    assert.deepEqual(await readFile(join(f.cwd, moved.path)), bytes);
    await assert.rejects(readFile(join(f.cwd, "原 %20.bin")), {
      code: "ENOENT",
    });
    await f.reader.mutateFile("s", f.scope.sessionPath, {
      kind: "move",
      path: "folder",
      identity: await f.identity("folder"),
      directory: "destination",
      name: "folder",
    });
    assert.equal(
      await readFile(
        join(f.cwd, "destination", "folder", "nested.txt"),
        "utf8",
      ),
      "nested original",
    );
    await writeFile(join(f.cwd, "conflict.bin"), "preserve me");
    await assert.rejects(
      f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "move",
        path: encodeURI(moved.path),
        identity: await f.identity(moved.path),
        directory: ".",
        name: "conflict.bin",
      }),
      { code: "ARTIFACT_EXISTS" },
    );
    assert.equal(
      await readFile(join(f.cwd, "conflict.bin"), "utf8"),
      "preserve me",
    );
    assert.deepEqual(await readFile(join(f.cwd, moved.path)), bytes);
    await mkdir(join(f.cwd, "occupied"));
    await assert.rejects(
      f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "move",
        path: "destination/folder",
        identity: await f.identity("destination/folder"),
        directory: ".",
        name: "occupied",
      }),
      { code: "ARTIFACT_EXISTS" },
    );
    assert.equal(
      await readFile(
        join(f.cwd, "destination", "folder", "nested.txt"),
        "utf8",
      ),
      "nested original",
    );
  } finally {
    await f.cleanup();
  }
});

test("trash preserves ignored contents across reader recreation, stays out of Git additions and restores without overwriting", async () => {
  const f = await fixture();
  try {
    execFileSync("git", ["init", "--quiet", f.cwd]);
    await writeFile(join(f.cwd, ".gitignore"), "private/\n");
    await mkdir(join(f.cwd, "private"));
    await writeFile(
      join(f.cwd, "private", "credentials.bin"),
      Buffer.from([0, 255, 28]),
    );
    const result = await f.reader.mutateFile("s", f.scope.sessionPath, {
      kind: "trash",
      path: "private",
      identity: await f.identity("private"),
    });
    assert.ok(result.trashed);
    assert.deepEqual(
      (await f.reader.listFiles("s", ".", "", f.scope.sessionPath)).entries
        .map((entry) => entry.name)
        .sort(),
      [".git", ".gitignore"],
    );
    assert.deepEqual(
      (await f.reader.listFiles("s", ".", "credentials", f.scope.sessionPath))
        .entries,
      [],
    );
    execFileSync("git", ["add", "-A"], { cwd: f.cwd });
    const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: f.cwd,
      encoding: "utf8",
    });
    assert.equal(staged.trim(), ".gitignore");
    assert.equal(
      await readFile(join(f.cwd, ".gitignore"), "utf8"),
      "private/\n",
    );
    f.reader.dispose();
    const restoredReader = new ArtifactReader(() => f.scope);
    try {
      const listing = await restoredReader.listTrash("s", f.scope.sessionPath);
      assert.deepEqual(listing.entries, [result.trashed]);
      await mkdir(join(f.cwd, "private"));
      await writeFile(
        join(f.cwd, "private", "new.txt"),
        "new folder must stay",
      );
      await assert.rejects(
        restoredReader.mutateFile("s", f.scope.sessionPath, {
          kind: "restore",
          id: result.trashed.id,
          identity: result.trashed.identity,
        }),
        { code: "ARTIFACT_EXISTS" },
      );
      assert.equal(
        await readFile(join(f.cwd, "private", "new.txt"), "utf8"),
        "new folder must stay",
      );
      assert.equal(
        (await restoredReader.listTrash("s", f.scope.sessionPath)).entries
          .length,
        1,
      );
      await rename(join(f.cwd, "private"), join(f.cwd, "new-private"));
      const restored = await restoredReader.mutateFile(
        "s",
        f.scope.sessionPath,
        {
          kind: "restore",
          id: result.trashed.id,
          identity: result.trashed.identity,
        },
      );
      assert.equal(restored.path, "private");
      assert.deepEqual(
        await readFile(join(f.cwd, "private", "credentials.bin")),
        Buffer.from([0, 255, 28]),
      );
      assert.deepEqual(
        (await restoredReader.listTrash("s", f.scope.sessionPath)).entries,
        [],
      );
    } finally {
      restoredReader.dispose();
    }
  } finally {
    await f.cleanup();
  }
});

test("queued organization rechecks native writes, exact Session identity and explicit revocation", async () => {
  const f = await fixture();
  try {
    for (const change of ["content", "session", "revoke"] as const) {
      f.setScope({ sessionId: "s", sessionPath: "/sessions/one", cwd: f.cwd });
      await writeFile(join(f.cwd, "note.txt"), "original");
      const identity = await f.identity("note.txt");
      let unlock!: () => void;
      const wait = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      let entered!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const native = withFileMutationQueue(
        join(f.cwd, "note.txt"),
        async () => {
          entered();
          await wait;
          if (change === "content")
            await writeFile(join(f.cwd, "note.txt"), "native update");
        },
      );
      await ready;
      const mutation = f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "trash",
        path: "note.txt",
        identity,
      });
      const settled = mutation.then(
        () => undefined,
        (error: unknown) => error,
      );
      await withFileMutationQueue(
        join(f.cwd, "independent"),
        async () => undefined,
      );
      if (change === "session")
        f.setScope({ ...f.scope, sessionPath: "/sessions/copied" });
      if (change === "revoke") f.reader.revoke();
      unlock();
      await native;
      const error = await settled;
      assert.equal(
        (error as { code: string }).code,
        change === "content" ? "ARTIFACT_CHANGED" : "ARTIFACT_DENIED",
      );
      assert.equal(
        await readFile(join(f.cwd, "note.txt"), "utf8"),
        change === "content" ? "native update" : "original",
      );
    }
  } finally {
    await f.cleanup();
  }
});

test("organization rejects protected roots, stale versions, outside paths, links and moving a directory into itself", async () => {
  const f = await fixture();
  try {
    for (const name of [".git", ".pi"]) {
      await mkdir(join(f.cwd, name));
      await assert.rejects(
        f.reader.mutateFile("s", f.scope.sessionPath, {
          kind: "trash",
          path: name,
          identity: await f.identity(name),
        }),
        { code: "ARTIFACT_DENIED" },
      );
    }
    await mkdir(join(f.cwd, "folder"));
    const folderIdentity = await f.identity("folder");
    await assert.rejects(
      f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "move",
        path: "folder",
        identity: folderIdentity,
        directory: "folder",
        name: "nested",
      }),
      { code: "ARTIFACT_DENIED" },
    );
    await writeFile(join(f.cwd, "note.txt"), "original");
    const stale = await f.identity("note.txt");
    await writeFile(join(f.cwd, "note.txt"), "new version");
    await assert.rejects(
      f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "trash",
        path: "note.txt",
        identity: stale,
      }),
      { code: "ARTIFACT_CHANGED" },
    );
    await assert.rejects(
      f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "trash",
        path: "../outside",
        identity: stale,
      }),
      { code: "ARTIFACT_DENIED" },
    );
    await assert.rejects(
      f.reader.mutateFile("s", "/sessions/copied", {
        kind: "trash",
        path: "note.txt",
        identity: stale,
      }),
      { code: "ARTIFACT_DENIED" },
    );
    if (process.platform !== "win32") {
      await symlink(f.root, join(f.cwd, "link"));
      await assert.rejects(
        f.reader.mutateFile("s", f.scope.sessionPath, {
          kind: "move",
          path: "note.txt",
          identity: await f.identity("note.txt"),
          directory: "link",
          name: "escaped",
        }),
        { code: "ARTIFACT_DENIED" },
      );
      await assert.rejects(
        f.reader.mutateFile("s", f.scope.sessionPath, {
          kind: "trash",
          path: "link",
          identity: stale,
        }),
        { code: "ARTIFACT_DENIED" },
      );
    }
    assert.equal(
      await readFile(join(f.cwd, "note.txt"), "utf8"),
      "new version",
    );
  } finally {
    await f.cleanup();
  }
});

test("preexisting trash paths and damaged restore metadata never take ownership of user files", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.cwd, "note.txt"), "original");
    await mkdir(join(f.cwd, ".openpi-trash"));
    await writeFile(
      join(f.cwd, ".openpi-trash", "user.txt"),
      "existing private evidence",
    );
    await assert.rejects(
      f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "trash",
        path: "note.txt",
        identity: await f.identity("note.txt"),
      }),
    );
    assert.equal(await readFile(join(f.cwd, "note.txt"), "utf8"), "original");
    assert.equal(
      await readFile(join(f.cwd, ".openpi-trash", "user.txt"), "utf8"),
      "existing private evidence",
    );
    await rename(
      join(f.cwd, ".openpi-trash"),
      join(f.cwd, "existing-evidence"),
    );
    const result = await f.reader.mutateFile("s", f.scope.sessionPath, {
      kind: "trash",
      path: "note.txt",
      identity: await f.identity("note.txt"),
    });
    assert.ok(result.trashed);
    await writeFile(
      join(f.cwd, ".openpi-trash", result.trashed.id, "contents"),
      "changed private contents",
    );
    await assert.rejects(
      f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "restore",
        id: result.trashed.id,
        identity: result.trashed.identity,
      }),
      { code: "ARTIFACT_CHANGED" },
    );
    assert.equal(
      (await f.reader.listTrash("s", f.scope.sessionPath)).unavailable,
      1,
    );
    assert.equal(
      await readFile(
        join(f.cwd, ".openpi-trash", result.trashed.id, "contents"),
        "utf8",
      ),
      "changed private contents",
    );
    await assert.rejects(
      f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "restore",
        id: "../../outside",
        identity: result.trashed.identity,
      }),
      { code: "ARTIFACT_DENIED" },
    );
  } finally {
    await f.cleanup();
  }
});

test("folder import retains nested paths and per-file conflicts without following destination links", async () => {
  const f = await fixture();
  try {
    const result = await f.reader.mutateFile("s", f.scope.sessionPath, {
      kind: "import-file",
      directory: encodeURI("资料/子目录"),
      name: "数据.bin",
      data: Buffer.from([0, 255, 11]).toString("base64"),
      createParents: true,
    });
    assert.equal(result.path, "资料/子目录/数据.bin");
    assert.deepEqual(
      await readFile(join(f.cwd, result.path)),
      Buffer.from([0, 255, 11]),
    );
    await assert.rejects(
      f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "import-file",
        directory: encodeURI("资料/子目录"),
        name: "数据.bin",
        data: "",
        createParents: true,
      }),
      { code: "ARTIFACT_EXISTS" },
    );
    assert.deepEqual(
      await readFile(join(f.cwd, result.path)),
      Buffer.from([0, 255, 11]),
    );
    await assert.rejects(
      f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "import-file",
        directory: "../outside",
        name: "file.bin",
        data: "",
        createParents: true,
      }),
      { code: "ARTIFACT_DENIED" },
    );
    if (process.platform !== "win32") {
      await symlink(f.root, join(f.cwd, "link"));
      await assert.rejects(
        f.reader.mutateFile("s", f.scope.sessionPath, {
          kind: "import-file",
          directory: "link/escape",
          name: "file.bin",
          data: "",
          createParents: true,
        }),
        { code: "ARTIFACT_DENIED" },
      );
    }
    assert.deepEqual(await readdir(f.root), ["workspace"]);
  } finally {
    await f.cleanup();
  }
});

test("trash pagination reaches every removed entry without capping future file operations", async () => {
  const f = await fixture();
  try {
    await Promise.all(
      Array.from({ length: 252 }, (_, index) =>
        writeFile(
          join(f.cwd, `file-${String(index).padStart(3, "0")}.txt`),
          String(index),
        ),
      ),
    );
    for (let index = 0; index < 252; index++) {
      const [entry] = (
        await f.reader.listFiles("s", ".", "", f.scope.sessionPath)
      ).entries;
      assert.ok(entry?.identity);
      await f.reader.mutateFile("s", f.scope.sessionPath, {
        kind: "trash",
        path: entry.path,
        identity: entry.identity,
      });
    }
    const first = await f.reader.listTrash("s", f.scope.sessionPath);
    assert.equal(first.entries.length, 250);
    assert.ok(first.nextCursor);
    const second = await f.reader.listTrash(
      "s",
      f.scope.sessionPath,
      first.nextCursor,
    );
    assert.equal(second.entries.length, 2);
    assert.equal(second.nextCursor, undefined);
    assert.equal(
      new Set([...first.entries, ...second.entries].map((entry) => entry.id))
        .size,
      252,
    );
    const entry = second.entries[0]!;
    await f.reader.mutateFile("s", f.scope.sessionPath, {
      kind: "restore",
      id: entry.id,
      identity: entry.identity,
    });
    assert.equal(
      await readFile(join(f.cwd, entry.path), "utf8"),
      String(Number(entry.path.match(/\d+/u)?.[0])),
    );
  } finally {
    await f.cleanup();
  }
});

test("case-only renames share one native write lane without hanging on case-insensitive filesystems", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.cwd, "Case.txt"), "case original");
    const result = await f.reader.mutateFile("s", f.scope.sessionPath, {
      kind: "move",
      path: "Case.txt",
      identity: await f.identity("Case.txt"),
      directory: ".",
      name: "case.txt",
    });
    assert.equal(result.path, "case.txt");
    assert.equal(
      await readFile(join(f.cwd, "case.txt"), "utf8"),
      "case original",
    );
    assert.deepEqual(
      (await f.reader.listFiles("s", ".", "", f.scope.sessionPath)).entries.map(
        (entry) => entry.name,
      ),
      ["case.txt"],
    );
  } finally {
    await f.cleanup();
  }
});
