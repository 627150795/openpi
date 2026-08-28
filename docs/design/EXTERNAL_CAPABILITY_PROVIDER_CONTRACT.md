# External Capability Provider Contract

Status: design contract. This document defines the boundary for external
Skills, MCP servers, and Pi packages that provide Browser, Web, GitHub,
Computer, Security, or media capabilities. It does not add a provider, a
registry, or a new model-facing tool.

## Decision

OpenPI consumes provider declarations at the capability boundary and applies a
fail-closed intersection. Pi remains the source of truth for package loading,
tool registration, credentials, Sessions, Trust, and provider/model routing.
An external provider remains the owner of its processes, credentials,
artifacts, and native cancellation. OpenPI owns only the boundary facts it
needs to classify, observe, and safely project.

The normal Session keeps zero external capability tools. A provider becomes
model-visible only after the parent explicitly loads the capability through
Pi's package/Skill/MCP path and the boundary accepts its declaration.

## Provider declaration

The following is the smallest useful conceptual declaration. It is a contract
shape, not a runtime API to implement pre-emptively.

```json
{
  "id": "vendor.capability",
  "version": "1.0.0",
  "source": "pi package source or MCP identity",
  "schemaHash": "hash of names and model-facing schemas",
  "kind": "web | browser | github | computer | security | media",
  "permissions": {
    "read": true,
    "write": false,
    "exec": false,
    "network": true,
    "desktop": false
  },
  "ownerScope": "process | session | cwd | project",
  "safety": {
    "child": "safe | forbidden",
    "workflow": "safe | forbidden",
    "replay": "safe | forbidden"
  },
  "lifecycle": {
    "cancel": "provider-owned",
    "shutdown": "provider-owned",
    "cleanup": "provider-owned"
  },
  "result": {
    "maxBytes": 5242880,
    "reference": "provider-owned opaque reference"
  },
  "credentialOwner": "pi | provider",
  "changesPromptShape": false
}
```

Required facts are stable identity and version, source, schema hash, capability
kind, permission set, owner scope, child/Workflow/Replay classification,
cancellation and cleanup ownership, bounded result/reference behavior, and
credential ownership. A missing or malformed fact is not an invitation to
infer a safe default.

`schemaHash` covers the registered tool names and the exact model-facing
schemas. A descriptive label is not evidence of a read-only or replay-safe
tool.

## Threat model and authority

The provider boundary treats external declarations and implementations as
untrusted inputs. The relevant failures are:

- a tool is registered without a declaration or is classified too broadly;
- a provider source or schema changes after classification;
- a child inherits a write, network, desktop, or process capability by
  accident;
- a completion is reported without an owner, cleanup result, or bounded
  recoverable reference;
- credentials or provider-private continuation state enter OpenPI config or
  model context;
- Replay reuses a call whose external side effect cannot be proven absent.

For a child or Workflow run, effective authority is the intersection of three
sets:

```text
effective authority
  = parent-authorized capabilities
  ∩ provider-declared capabilities
  ∩ child/workflow policy
```

Unknown tools, unknown declarations, missing source identity, and schema drift
produce an empty intersection and an explicit diagnostic. They must never
widen authority through a fallback or a name-based guess. Replay adds a fourth
condition: the call must be classified replay-safe and its observable input
and filesystem boundary must remain stable.

This matches the current OpenPI child rule: package tools are excluded by
default, and only the narrow read-only allowlist in
`extensions/shared/child-session.ts` is child-safe. An external provider does
not become child-safe merely because its tool name contains `read`, `search`, or
`browser`.

## Ownership, cancellation, and receipts

The declaration identifies who owns the live resource. The provider owns its
processes, sockets, credentials, provider-native state, and provider-owned
artifacts. Pi owns package and Session lifecycle. OpenPI records only bounded
references and boundary receipts; it does not become a second provider control
plane.

Every externally started operation needs an observable receipt with at least:

| Fact | Required meaning |
| --- | --- |
| provider identity | source, id, version, and schema hash used for the operation |
| owner | process, Session, cwd, or project owner and its identity |
| state | running, succeeded, failed, partial, cancelled, or uncertain |
| cancellation | requested, acknowledged, timed out, or unavailable |
| cleanup | completed, failed with evidence, or uncertain; never silently omitted |
| result | bounded inline result or an opaque provider-owned reference |

Process exit alone is not success. A cancellation request without cleanup
evidence is not cleanup. If the provider disappears before a terminal receipt,
the boundary reports `uncertain` and preserves the reference for recovery or
manual inspection.

## Integration with current OpenPI seams

The contract composes with existing ownership rather than creating a new
router:

| Concern | Current owner / boundary |
| --- | --- |
| capability disclosure | `extensions/shared/tool-surface.ts` and the capability gateway |
| child classification | `extensions/shared/child-session.ts` |
| Workflow lifecycle and Replay | `extensions/workflows/` and its replay-safety boundary |
| Session, Trust, packages, credentials | Pi |
| provider processes and native cancellation | the provider |
| operator-visible projection | provider result/receipt plus OpenPI's bounded UI projection |

An external Web or GitHub read provider may be eligible for child use only
after it is explicitly classified and its source/schema are verified. A
Browser process, real Desktop control, or Security scanner is forbidden in a
child and in Replay by default; an explicit high-authority integration must
provide a separate reviewed policy. The provider's credentials stay with Pi
or the provider and are never written into OpenPI setup config.

## Drift and validation

At load time, a future implementation should compare the declaration with the
actual registered source, tool names, and schemas. A mismatch must prevent
activation and report expected source/schema hash, observed source/schema hash,
and the affected tool names without exposing credentials.

The minimum validation matrix is:

| Scenario | Expected result |
| --- | --- |
| unused provider | no model-visible tool, prompt, dependency, or runtime work |
| missing declaration | fail closed before child/Workflow activation |
| unknown tool or permission | fail closed; do not guess from its name |
| schema/source drift | fail closed with a bounded diagnostic |
| read-only Web/GitHub provider | parent may load; child use requires explicit safe classification |
| Browser/Desktop/Security provider | parent-only by default; no Replay |
| cancel/shutdown/cleanup | terminal receipt distinguishes success, failure, and uncertainty |
| provider credential | remains provider/Pi-owned and redacted from receipts |
| Replay candidate | only a stable, side-effect-free, explicitly safe call may replay |

The smoke test for a real provider should prove parent activation, child
exclusion, source/schema mismatch failure, cancellation, cleanup, bounded
result recovery, and unchanged ordinary-turn prompt/tool shape. It must use
the provider's documented test credential boundary, not a secret copied into
OpenPI configuration.

## What to combine and what not to build

OpenPI should combine the useful contract ideas: progressive disclosure,
explicit permission classification, source/schema fingerprints, owner-scoped
receipts, fail-closed child intersection, and bounded recoverable results.

OpenPI should not build:

- a second Web Search provider catalog or provider/model stack;
- bundled Chromium, desktop native addons, or a Security cloud client;
- a process-global capability/resource router;
- automatic inheritance of external tools into children;
- provider secret storage in OpenPI setup;
- provider-specific execution logic copied into each OpenPI extension.

Implementation is justified only when a real external provider needs this
boundary. Until then, this document is the contract and the existing child,
capability, Workflow, and provenance checks remain the enforcement surfaces.
