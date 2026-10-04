import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  inspectSetupConfig,
  REASONING_LEVELS,
} from "../shared/setup-config.ts";
import { SUBAGENT_ROLE_NAMES } from "../shared/subagent-roles.ts";
import {
  OPENPI_TOOL_SURFACE_NAMES,
  OPENPI_OWNER_SOURCE_PATHS,
  patchOwnedTools,
} from "../shared/tool-surface.ts";
import {
  webCapabilitySnapshot,
  type WebCapabilityProjection,
  type WebCapabilityKind,
} from "../shared/web-observer-registry.ts";

export const MAX_SNAPSHOT_BYTES = 16 * 1024;
const MAX_RESOURCE_ITEMS = 32;
const MAX_TOOL_NAMES = 64;
const PACKAGE_DIRECTORY = fileURLToPath(new URL("../../", import.meta.url));
const SAFE_TOOL_NAMES = new Set([
  "read",
  "bash",
  "edit",
  "write",
  "ls",
  "find",
  "grep",
  ...OPENPI_TOOL_SURFACE_NAMES,
]);
const RESOURCE_STATUSES = new Set([
  "running",
  "done",
  "error",
  "completed",
  "failed",
  "aborted",
  "uncertain",
  "killed",
  "timed_out",
]);

function unavailable() {
  return { availability: "unavailable" as const, sampledAt: Date.now() };
}

function sample<T>(read: () => T) {
  try {
    return {
      availability: "available" as const,
      sampledAt: Date.now(),
      ...read(),
    };
  } catch {
    // Exception messages may contain paths, endpoints, or credentials.
    return unavailable();
  }
}

function thinkingLevel(value: unknown) {
  return REASONING_LEVELS.find((level) => level === value) ?? "unknown";
}

function abortIfNeeded(signal?: AbortSignal) {
  signal?.throwIfAborted();
}

async function gitRead(cwd: string, args: string[], signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "git",
      [
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.untrackedCache=false",
        "-C",
        cwd,
        ...args,
      ],
      {
        encoding: "utf8",
        timeout: 1_000,
        maxBuffer: 8 * 1024,
        signal,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

/**
 * Facts for cwd's containing Git worktree, including changes outside nested cwd.
 * Dirty covers tracked and normal untracked status, not ignored files.
 * No branch/path/remote names, locks, refresh, or cleanup.
 */
export async function readDiskSnapshot(cwd: string, signal?: AbortSignal) {
  abortIfNeeded(signal);
  try {
    const head = (
      await gitRead(cwd, ["rev-parse", "--verify", "HEAD"], signal)
    ).trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) return unavailable();
    const status = await gitRead(
      cwd,
      [
        "status",
        "--porcelain=v1",
        "--untracked-files=normal",
        "--ignore-submodules=none",
      ],
      signal,
    );
    abortIfNeeded(signal);
    return {
      availability: "available" as const,
      sampledAt: Date.now(),
      head,
      dirty: status.length > 0,
    };
  } catch {
    abortIfNeeded(signal);
    return unavailable();
  }
}

interface SnapshotDependencies {
  inspectConfig: () => Pick<
    ReturnType<typeof inspectSetupConfig>,
    "source" | "writable" | "config"
  >;
  disk: typeof readDiskSnapshot;
}

/** Join existing facts, not an authority store or an atomic multi-owner view. */
export async function collectRuntimeSnapshot(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  registrationEpoch: number,
  dependencies: SnapshotDependencies = {
    inspectConfig: inspectSetupConfig,
    disk: readDiskSnapshot,
  },
  signal?: AbortSignal,
) {
  abortIfNeeded(signal);
  const startedAt = Date.now();
  // Read each source afresh. Do not cache settings, context, or owner samples.
  let configuredIdentity: { provider?: string; model?: string } | undefined;
  const configured = sample(() => {
    const settings = pi.getSettings();
    configuredIdentity = {
      provider: settings.defaultProvider,
      model: settings.defaultModel,
    };
    return {
      source: "pi-effective-settings" as const,
      model: {
        present: !!settings.defaultModel,
        providerPresent: !!settings.defaultProvider,
        identifiers: "redacted" as const,
      },
      thinking: thinkingLevel(settings.defaultThinkingLevel),
      provenanceLayers: "unavailable" as const,
    };
  });
  const packageConfig = sample(() => {
    const inspection = dependencies.inspectConfig();
    if (!inspection.writable) throw new Error("Unavailable configuration");
    const config = inspection.config;
    return {
      source:
        inspection.source === "missing"
          ? ("package-defaults" as const)
          : ("package-config-disk" as const),
      suggestionModelConfigured: !!config.suggestions.model,
      roleModelOverrides: SUBAGENT_ROLE_NAMES.filter(
        (role) => !!config.subagents.roleModels[role],
      ),
      identifiers: "redacted" as const,
    };
  });
  const sessionSelected = sample(() => {
    const model = ctx.model;
    return {
      source: "pi-context" as const,
      model: { present: !!model, identifiers: "redacted" as const },
      thinking: thinkingLevel(pi.getThinkingLevel()),
      matchesConfiguredDefault:
        configured.availability === "available" &&
        model &&
        configuredIdentity?.provider &&
        configuredIdentity.model
          ? model.provider === configuredIdentity.provider &&
            model.id === configuredIdentity.model
          : ("unknown" as const),
      upstreamRoute: "unknown" as const,
    };
  });
  const trust = sample(() => ({
    source: "pi-context-live-decision" as const,
    projectTrusted: ctx.isProjectTrusted(),
    persistedDecision: "unavailable" as const,
    filesystemSandbox: false,
  }));
  const packageProvenance = sample(() => {
    const definitions = pi
      .getAllTools()
      .filter((tool) => tool.name === "runtime_snapshot");
    const definition = definitions.length === 1 ? definitions[0] : undefined;
    if (definition?.sourceInfo?.path !== OPENPI_OWNER_SOURCE_PATHS.runtime) {
      throw new Error("Unavailable definition provenance");
    }
    const { scope, origin } = definition.sourceInfo;
    return {
      source: "pi-tool-source-info" as const,
      scope:
        scope === "user" || scope === "project" || scope === "temporary"
          ? scope
          : "unknown",
      origin:
        origin === "package" || origin === "top-level" ? origin : "unknown",
      singleOpenpiSource: "unknown" as const,
    };
  });
  const toolBoundary = sample(() => {
    const active = pi.getActiveTools();
    const allowlisted = active.filter((name) => SAFE_TOOL_NAMES.has(name));
    return {
      source: "pi-active-tools" as const,
      active: {
        names: allowlisted.slice(0, MAX_TOOL_NAMES),
        omitted: Math.max(0, allowlisted.length - MAX_TOOL_NAMES),
      },
      roleRestrictions: "unavailable" as const,
    };
  });

  // Registry lookup does not acquire a manager, subscribe, or request detail.
  let remaining = MAX_RESOURCE_ITEMS;
  function resource(kind: WebCapabilityKind, query: string) {
    const ownerSample = sample(() => {
      const projection: WebCapabilityProjection | undefined =
        webCapabilitySnapshot(ctx.sessionManager, kind)[kind];
      if (!projection) throw new Error("Unavailable owner");
      const items = projection.items.slice(0, remaining).map((item) => ({
        status: RESOURCE_STATUSES.has(item.status) ? item.status : "unknown",
      }));
      const omitted =
        Math.max(0, projection.omitted) +
        projection.items.length -
        items.length;
      const truncated =
        projection.truncated || projection.items.length > items.length;
      remaining -= items.length;
      return { items, omitted, truncated };
    });
    return {
      ...ownerSample,
      source: "session-owner-observer" as const,
      query,
      items: "items" in ownerSample ? ownerSample.items : [],
      omitted: "omitted" in ownerSample ? ownerSample.omitted : 0,
      truncated: "truncated" in ownerSample ? ownerSample.truncated : false,
    };
  }
  const resources = {
    subagents: resource("subagents", "subagent_list"),
    workflows: resource("workflows", "workflow_status"),
    background: resource("background-terminals", "bg_list"),
  };
  const diskSample = async (cwd: string) => {
    try {
      return await dependencies.disk(cwd, signal);
    } catch {
      abortIfNeeded(signal);
      return unavailable();
    }
  };
  const [packageDisk, projectDisk] = await Promise.all([
    diskSample(PACKAGE_DIRECTORY),
    diskSample(ctx.cwd),
  ]);
  abortIfNeeded(signal);
  return {
    version: 1,
    sampledAt: startedAt,
    completedAt: Date.now(),
    consistency: "non-atomic-owner-samples" as const,
    configured: { ...configured, package: packageConfig },
    sessionSelected,
    trust,
    packageProvenance,
    toolBoundary,
    disk: { package: packageDisk, project: projectDisk },
    loaded: {
      availability: "available" as const,
      sampledAt: startedAt,
      source: "extension-registration" as const,
      registrationEpoch,
      revision: "unknown" as const,
      piVersion: "unavailable" as const,
      openpiVersion: "unavailable" as const,
    },
    resources,
  };
}

export function snapshotToolResult(
  snapshot: Awaited<ReturnType<typeof collectRuntimeSnapshot>>,
) {
  const result = {
    content: [{ type: "text" as const, text: JSON.stringify(snapshot) }],
    details: snapshot,
  };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_SNAPSHOT_BYTES)
    return result;
  // Bound the entire tool result, including details, not only its visible text.
  const bounded = {
    availability: "unavailable",
    reason: "output-bound",
    sampledAt: Date.now(),
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(bounded) }],
    details: bounded,
  };
}

export default function runtimeSnapshot(pi: ExtensionAPI) {
  const registrationEpoch = Date.now();
  pi.on("session_start", () => {
    patchOwnedTools(pi, "runtime", { enable: ["runtime_snapshot"] });
  });
  pi.registerTool({
    name: "runtime_snapshot",
    label: "Runtime Snapshot",
    description:
      "Read a bounded, redacted parent runtime sample. Configured, Session-selected, disk and loaded facts are separate; loaded revision and upstream route may be unknown. No model calls or resource startup.",
    defaultActive: false,
    parameters: Type.Object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    async execute(_id, _params, signal, _onUpdate, ctx) {
      return snapshotToolResult(
        await collectRuntimeSnapshot(
          pi,
          ctx,
          registrationEpoch,
          undefined,
          signal,
        ),
      );
    },
  });
}
