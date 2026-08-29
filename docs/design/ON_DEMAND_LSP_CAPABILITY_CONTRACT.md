# On-Demand LSP Capability Contract

Status: design-only first pass for [issue #163](https://github.com/tt-a1i/openpi/issues/163). This document defines a future capability boundary; the current OpenPI runtime has no LSP client, server, or LSP dependency.

## Problem

OpenPI already treats optional features as Pi-native capabilities. A session starts with a small tool surface, and explicit capability loading can add a stable group such as `search`, `delegate`, `workflow`, `background`, or `session`. The current `search` group provides `fd`, `rg`, and read-only git inspection; it does not provide language-server operations.

An LSP integration should preserve that model. It should not silently start servers, add a large permanent tool schema, or turn an editor protocol into an unrestricted file and process gateway.

## Scope

This first pass defines the smallest useful contract for an optional, on-demand LSP capability. It does not add an LSP runtime, choose a client library, discover servers, modify dependencies, or change the current capability list.

## Activation and visibility

```text
session start
    │
    ├─ explicit discovery (default): no LSP tools
    └─ opt-in adaptive discovery: only the capability gateway is visible

explicit user request
    │
    ▼
load the LSP capability group once for this Session
    │
    ▼
register a stable, bounded tool group
    │
    ▼
start or attach to a server only for a requested workspace/language
```

The future group should follow the current `loadOpenPiCapabilities` rules:

- no LSP tool is visible before the group is loaded;
- loading is explicit and monotonic for the Session;
- loading the group must not start a server as a side effect;
- the tool schema is stable after loading, independent of which project has been opened;
- an unavailable server or language falls back to a clear error, not an invented text result;
- the capability gateway remains the only discovery surface when adaptive discovery is enabled.

“Loaded” means that the capability is allowed to handle a request. It does not mean that a server is running or that a language is supported.

## Minimal operation surface

The eventual tool names are implementation details, but the initial group should stay small and separate reads from mutations. A candidate surface is:

| Operation | Default effect | Required boundary |
| --- | --- | --- |
| `lsp_status` | Read session/server state | No process start, file write, or model-visible raw protocol dump. |
| `lsp_query` | Read symbols, diagnostics, definitions, references, or hover data | Workspace and language must be explicit or unambiguously resolved from the target path. |
| `lsp_edit` | Apply a requested language-aware edit | Must be separately authorized; preview first and write only approved files. |

The first implementation may ship only `lsp_status` and `lsp_query`. `lsp_edit` should not be implied by a read capability and can remain unavailable until its approval and rollback semantics are tested.

## Workspace and session ownership

Every request must bind to one explicit workspace identity:

- canonical repository root and the requested path must be checked before dispatch;
- a worktree is a distinct writable boundary even when it shares an object database with its repository;
- a child session inherits no LSP server or write authority by accident;
- a child may receive a read-only LSP projection only when the parent grants that capability;
- server processes and open documents belong to the owning Pi Session and are disposed at Session shutdown;
- a server must not outlive the Session that authorized it unless a separately designed shared-service owner exists.

The server's current working directory, root URI, and document set must be recorded in status. A path supplied by a model is data to validate, not permission to escape the workspace.

## Read and write boundaries

Read operations may return bounded, structured projections of server responses:

- URI/path, range, symbol kind, severity, message, and concise related information;
- the server identity and workspace used for the request;
- an explicit `partial` marker when the response was truncated or incomplete.

They must not return an unbounded protocol trace, environment dump, or arbitrary server-side file contents. Existing file-search output discipline remains the fallback when the user only needs text search.

Write operations, if introduced later, require all of the following:

1. an explicit write-capable request, not merely LSP capability loading;
2. a validated path set contained by the authorized worktree;
3. a preview or diff before applying edits;
4. a bounded edit set with conflict detection against the current file contents;
5. an atomic write or an explicit rollback/error receipt;
6. a post-write readback or test hook when the caller requests verification.

If any check fails, do not apply a subset silently. A read-only query must never become a write through server initialization or a code-action response.

## Lifecycle, cancellation, and timeouts

Each request owns a bounded operation:

```text
requested → starting (optional) → ready → running → completed
                                      ├→ failed
                                      ├→ cancelled
                                      └→ timed_out
```

- Server startup is lazy and must have a deadline.
- Request cancellation must cancel the client request and, when safe, the underlying server work.
- A timed-out request must not leave a promise or process untracked.
- Session shutdown must cancel pending requests, close documents, stop owned servers, and report cleanup failures.
- A server that exits unexpectedly is `failed`; it is not transparently restarted during the same request.
- Retry, if later supported, must be a new operation with a new identity and visible attempt count.

The result must distinguish `server_unavailable`, `request_failed`, `cancelled`, and `timed_out`. An empty diagnostics or symbol list is not enough to prove that the server succeeded.

## Fail-closed behavior

The capability must refuse to guess when authority or protocol state is ambiguous:

- unknown language, server, root, path, URI, or document version → reject the request;
- server handshake or initialization failure → return a structured failure;
- malformed protocol response → discard the malformed projection and report the error;
- response budget exceeded → return a bounded partial result with an explicit marker;
- write authorization, path containment, or current-content check fails → perform no write;
- cleanup cannot be confirmed → report the cleanup failure and preserve recovery information.

LSP output is advisory evidence. It cannot by itself mark a Task completed, accept a Workflow, or prove that a change compiles. A caller must run the relevant verifier when those claims matter.

## Model-visible result boundary

The model-facing response should contain:

- operation id and status;
- server/language/workspace summary;
- bounded result items;
- truncation or partial markers;
- a safe artifact reference only when the runtime created and verified it.

Raw JSON-RPC messages, process environment, credentials, and unbounded transcripts stay outside the model-visible result by default. A future diagnostics artifact must use the same bounded-output and safe-path rules as `file-search` and subagent result artifacts.

## Configuration and trust

LSP configuration can select executable names, arguments, environment variables, and workspace roots. Therefore:

- project-provided configuration is untrusted until Pi's project trust policy authorizes it;
- explicit user selection must not be silently widened by repository files or server responses;
- executable resolution must be visible and bounded;
- environment inheritance must exclude secrets unless the user explicitly authorizes them;
- server capabilities must narrow the client contract, never expand write permission;
- no server download or dependency installation occurs as an implicit query side effect.

## Future implementation checklist

- [ ] Choose a maintained client boundary and document its version/support matrix.
- [ ] Add a capability group without changing the default tool surface.
- [ ] Implement read-only status/query first, with workspace and session ownership tests.
- [ ] Add startup, cancellation, timeout, crash, and shutdown cleanup tests.
- [ ] Add response-budget and malformed-response tests.
- [ ] Decide whether writes are needed; if so, implement preview, containment, atomicity, and rollback before exposing them.
- [ ] Verify child-session inheritance and trusted/untrusted project configuration.
- [ ] Document how LSP evidence differs from compiler/test acceptance evidence.

Until these checks exist, this contract is a design reference only. Text search and read-only git inspection remain the supported search capabilities.
