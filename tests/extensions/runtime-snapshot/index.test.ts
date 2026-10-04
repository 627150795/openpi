import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import runtimeSnapshot, {
  collectRuntimeSnapshot,
  readDiskSnapshot,
  snapshotToolResult,
  MAX_SNAPSHOT_BYTES,
} from "../../../extensions/runtime-snapshot/index.ts";
import { DEFAULT_SETUP_CONFIG } from "../../../extensions/shared/setup-config.ts";
import { OPENPI_OWNER_SOURCE_PATHS } from "../../../extensions/shared/tool-surface.ts";
import { registerWebCapability } from "../../../extensions/shared/web-observer-registry.ts";

function fixture() {
  const scope = {};
  let selected = {
    provider: "private-account@example.com",
    id: "https://secret-endpoint.invalid/sk-secret",
    baseUrl: "https://private.invalid",
    headers: { Authorization: "Bearer secret" },
  };
  let thinking = "high";
  let trusted = true;
  let active = ["read", "runtime_snapshot", "private-account@example.com"];
  const pi = {
    getSettings: () => ({
      defaultProvider: "configured-provider",
      defaultModel: "configured-model",
      defaultThinkingLevel: "low",
      httpProxy: "secret",
    }),
    getThinkingLevel: () => thinking,
    getActiveTools: () => active,
    getAllTools: () => [
      {
        name: "runtime_snapshot",
        sourceInfo: {
          path: OPENPI_OWNER_SOURCE_PATHS.runtime,
          scope: "user",
          origin: "package",
          source: "https://secret.invalid/private",
          baseDir: "/private/user",
        },
      },
    ],
  } as unknown as ExtensionAPI;
  const ctx = {
    sessionManager: scope,
    cwd: "/private/user/project",
    get model() {
      return selected;
    },
    isProjectTrusted: () => trusted,
    modelRegistry: new Proxy(
      {},
      {
        get() {
          throw new Error("must not access model registry");
        },
      },
    ),
  } as unknown as ExtensionContext;
  let configReads = 0;
  const dependencies = {
    inspectConfig: () => {
      configReads++;
      return {
        source: "disk" as const,
        writable: true,
        raw: "sk-secret",
        bytes: "secret",
        path: "/private/user/config",
        config: DEFAULT_SETUP_CONFIG,
      };
    },
    disk: async () => ({
      availability: "available" as const,
      sampledAt: Date.now(),
      head: "a".repeat(40),
      dirty: false,
    }),
  };
  return {
    pi,
    ctx,
    scope,
    dependencies,
    reads: () => configReads,
    change() {
      selected = {
        ...selected,
        provider: "configured-provider",
        id: "configured-model",
      };
      thinking = "off";
      trusted = false;
      active = ["bash"];
    },
  };
}

test("snapshot separates configured/selected/disk/loaded and never serializes private strings", async () => {
  const f = fixture();
  const snapshot = await collectRuntimeSnapshot(
    f.pi,
    f.ctx,
    123,
    f.dependencies,
  );
  assert.equal(snapshot.configured.availability, "available");
  assert.equal(snapshot.sessionSelected.availability, "available");
  assert.equal(snapshot.disk.package.availability, "available");
  assert.equal(snapshot.trust.availability, "available");
  assert.equal(snapshot.sessionSelected.matchesConfiguredDefault, false);
  assert.equal(snapshot.sessionSelected.thinking, "high");
  assert.equal(snapshot.disk.package.head, "a".repeat(40));
  assert.equal(snapshot.loaded.revision, "unknown");
  assert.equal(snapshot.loaded.registrationEpoch, 123);
  assert.equal(snapshot.trust.projectTrusted, true);
  assert.equal(snapshot.packageProvenance.availability, "available");
  assert.equal(snapshot.packageProvenance.origin, "package");
  assert.equal(snapshot.packageProvenance.singleOpenpiSource, "unknown");
  assert.equal(snapshot.resources.subagents.availability, "unavailable");
  const output = JSON.stringify(snapshotToolResult(snapshot));
  for (const privateText of [
    "secret",
    "private",
    "example.com",
    "httpProxy",
    "Authorization",
    "configured-provider",
    "configured-model",
  ]) {
    assert.equal(output.includes(privateText), false, privateText);
  }
  assert.equal(f.reads(), 1);
  f.change();
  const next = await collectRuntimeSnapshot(f.pi, f.ctx, 456, f.dependencies);
  assert.equal(next.sessionSelected.availability, "available");
  assert.equal(next.trust.availability, "available");
  assert.equal(next.toolBoundary.availability, "available");
  assert.equal(next.sessionSelected.matchesConfiguredDefault, true);
  assert.equal(next.sessionSelected.thinking, "off");
  assert.equal(next.trust.projectTrusted, false);
  assert.deepEqual(next.toolBoundary.active.names, ["bash"]);
  assert.equal(next.loaded.registrationEpoch, 456);
});

test("existing owner samples are bounded and redacted; absent is not empty", async () => {
  const f = fixture();
  const unregister = registerWebCapability(f.scope, {
    kind: "subagents",
    snapshot: () => ({
      items: Array.from({ length: 80 }, () => ({
        id: "sk-secret",
        title: "/private/user",
        status: "running" as const,
        createdAt: 1,
      })),
      omitted: 3,
      truncated: false,
    }),
    detail() {
      throw new Error("must not read details");
    },
  });
  try {
    const snapshot = await collectRuntimeSnapshot(
      f.pi,
      f.ctx,
      123,
      f.dependencies,
    );
    assert.equal(snapshot.resources.subagents.availability, "available");
    assert.equal(snapshot.resources.subagents.items.length, 32);
    assert.equal(snapshot.resources.subagents.omitted, 51);
    assert.equal(snapshot.resources.workflows.availability, "unavailable");
    const result = snapshotToolResult(snapshot);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= MAX_SNAPSHOT_BYTES);
    assert.equal(JSON.stringify(result).includes("sk-secret"), false);
    unregister();
    const next = await collectRuntimeSnapshot(f.pi, f.ctx, 123, f.dependencies);
    assert.equal(next.resources.subagents.availability, "unavailable");
  } finally {
    unregister();
  }
});

test("owner/config/context errors are explicit unavailable, never raw exceptions", async () => {
  const f = fixture();
  const unregister = registerWebCapability(f.scope, {
    kind: "workflows",
    snapshot() {
      throw new Error("private-error");
    },
  });
  const emptyOwner = registerWebCapability(f.scope, {
    kind: "subagents",
    snapshot: () => ({ items: [], omitted: 0, truncated: false }),
  });
  try {
    const snapshot = await collectRuntimeSnapshot(f.pi, f.ctx, 123, {
      ...f.dependencies,
      inspectConfig() {
        throw new Error("private-error");
      },
    });
    assert.equal(snapshot.configured.package.availability, "unavailable");
    assert.equal(snapshot.resources.workflows.availability, "unavailable");
    assert.equal(snapshot.resources.subagents.availability, "available");
    assert.deepEqual(snapshot.resources.subagents.items, []);
    assert.equal(JSON.stringify(snapshot).includes("private-error"), false);
  } finally {
    unregister();
    emptyOwner();
  }
});

test("disk sampling tracks edits without claiming loaded revision and handles non-Git cwd", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openpi-snapshot-test-"));
  try {
    assert.equal(
      (await readDiskSnapshot(directory)).availability,
      "unavailable",
    );
    execFileSync("git", ["init", "-q", directory]);
    execFileSync("git", [
      "-C",
      directory,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      "base",
    ]);
    const clean = await readDiskSnapshot(directory);
    assert.equal(clean.availability, "available");
    assert.equal(clean.dirty, false);
    writeFileSync(join(directory, "new.txt"), "untracked");
    const dirty = await readDiskSnapshot(directory);
    assert.equal(dirty.availability, "available");
    assert.equal(dirty.dirty, true);
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(readDiskSnapshot(directory, aborted.signal));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the total resource and result byte budgets fail closed", async () => {
  const f = fixture();
  const unregister = (
    ["subagents", "workflows", "background-terminals"] as const
  ).map((kind) =>
    registerWebCapability(f.scope, {
      kind,
      snapshot: () => ({
        items: Array.from({ length: 32 }, () => ({
          id: "not-exported",
          title: "not-exported",
          status: "running" as const,
          createdAt: 1,
        })),
        omitted: 0,
        truncated: false,
      }),
    }),
  );
  try {
    const snapshot = await collectRuntimeSnapshot(
      f.pi,
      f.ctx,
      123,
      f.dependencies,
    );
    assert.equal(
      Object.values(snapshot.resources).reduce(
        (total, owner) => total + owner.items.length,
        0,
      ),
      32,
    );
    assert.equal(snapshot.resources.background.omitted, 32);
    assert.equal(snapshot.toolBoundary.availability, "available");
    snapshot.toolBoundary.active.names = ["x".repeat(MAX_SNAPSHOT_BYTES)];
    const bounded = snapshotToolResult(snapshot);
    assert.ok(Buffer.byteLength(JSON.stringify(bounded)) <= MAX_SNAPSHOT_BYTES);
    assert.match(JSON.stringify(bounded), /output-bound/);
  } finally {
    for (const dispose of unregister) dispose();
  }
});

test("unavailable configuration/provenance do not fabricate facts", async () => {
  const f = fixture();
  f.pi.getSettings = () => {
    throw new Error("private-settings-error");
  };
  f.pi.getAllTools = () => {
    throw new Error("private-source-error");
  };
  const snapshot = await collectRuntimeSnapshot(
    f.pi,
    f.ctx,
    123,
    f.dependencies,
  );
  assert.equal(snapshot.configured.availability, "unavailable");
  assert.equal(snapshot.packageProvenance.availability, "unavailable");
  assert.equal(snapshot.sessionSelected.availability, "available");
  assert.equal(snapshot.sessionSelected.matchesConfiguredDefault, "unknown");
  assert.equal(snapshot.sessionSelected.upstreamRoute, "unknown");
  assert.equal(JSON.stringify(snapshot).includes("private-"), false);
});

test("cancellation propagates instead of presenting a complete snapshot", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    collectRuntimeSnapshot(f.pi, f.ctx, 123, f.dependencies, controller.signal),
  );
  assert.equal(f.reads(), 0);
});

test("registration is inert and the tool has no setup or model side effects", () => {
  const events = new Map<string, (...args: unknown[]) => unknown>();
  const tools: ToolDefinition[] = [];
  const pi = {
    on(name: string, handler: (...args: unknown[]) => unknown) {
      events.set(name, handler);
    },
    registerTool(tool: ToolDefinition) {
      tools.push(tool);
    },
  } as unknown as ExtensionAPI;
  runtimeSnapshot(pi);
  assert.equal(tools[0]?.name, "runtime_snapshot");
  assert.equal(tools[0]?.defaultActive, false);
  assert.deepEqual([...events.keys()], ["session_start"]);
});
