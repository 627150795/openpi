// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { WebClient } from "../../web/ui/src/protocol/client.ts";
import { createWebStore } from "../../web/ui/src/store/web-store.ts";

const target = {
  sessionId: "deleted-child",
  sessionPath: "/sessions/child.jsonl",
  worktreePath: "/managed/child",
};
afterEach(() => vi.restoreAllMocks());

it("retries lost responses and uncertain receipts with the same exact request after navigation", async () => {
  const client = new WebClient();
  const release = vi
    .spyOn(client, "releaseSessionWorktree")
    .mockRejectedValueOnce(new Error("lost response"));
  const store = createWebStore(client);
  const action = store.getState().actions.releaseSessionWorktree;
  await expect(action(target)).rejects.toThrow("lost response");
  const request = release.mock.calls[0]![0];
  store.setState({
    selectedPath: "/other-session.jsonl",
    workspaceDraft: true,
  });
  release.mockResolvedValueOnce({
    ...request,
    state: "uncertain",
    reason: "ownership check incomplete",
  });
  await expect(action(target)).resolves.toMatchObject({ state: "uncertain" });
  release.mockResolvedValueOnce({ ...request, state: "removed" });
  await expect(action(target)).resolves.toMatchObject({ state: "removed" });
  expect(release.mock.calls.map(([value]) => value)).toEqual([
    request,
    request,
    request,
  ]);
  expect(store.getState()).toMatchObject({
    selectedPath: "/other-session.jsonl",
    workspaceDraft: true,
  });
});

it("uses a new request only after a preserved receipt and an explicit retry", async () => {
  const client = new WebClient();
  const release = vi
    .spyOn(client, "releaseSessionWorktree")
    .mockImplementation(async (request) => ({
      ...request,
      state: "preserved",
      reason: "referenced by another native Session",
    }));
  const action =
    createWebStore(client).getState().actions.releaseSessionWorktree;
  expect((await action(target)).reason).toContain("another native Session");
  await action(target);
  expect(release.mock.calls[1]![0].commandId).not.toBe(
    release.mock.calls[0]![0].commandId,
  );
  expect(release.mock.calls[1]![0]).toMatchObject(target);
});

it("rejects mismatched result identity and keeps the original command for recovery", async () => {
  const client = new WebClient();
  const release = vi
    .spyOn(client, "releaseSessionWorktree")
    .mockImplementationOnce(async (request) => ({
      ...request,
      sessionId: "other-child",
      state: "removed",
    }));
  const action =
    createWebStore(client).getState().actions.releaseSessionWorktree;
  await expect(action(target)).rejects.toThrow();
  const request = release.mock.calls[0]![0];
  release.mockResolvedValueOnce({ ...request, state: "removed" });
  await action(target);
  expect(release.mock.calls[1]![0]).toEqual(request);
});
