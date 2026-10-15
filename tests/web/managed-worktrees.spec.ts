// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { ManagedWorktreesDialog } from "../../web/ui/src/features/sessions/ManagedWorktreesDialog.tsx";
import { i18n } from "../../web/ui/src/i18n.ts";

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const target = {
  sessionId: "original-native-child",
  sessionPath: "/sessions/child.jsonl",
  worktreePath: "/managed/exact child",
};
function mount() {
  const client = {
    workspaceWorktrees: vi.fn().mockResolvedValue({
      worktrees: [target],
      truncated: false,
      unavailable: 0,
    }),
  };
  const actions = {
    releaseSessionWorktree: vi.fn().mockResolvedValue({
      ...target,
      commandId: "release",
      state: "preserved",
      reason: "another-native-session-references-worktree",
    }),
  };
  const onClose = vi.fn();
  const view = render(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(ManagedWorktreesDialog, {
        workspace: "/project",
        client,
        actions,
        connected: true,
        onClose,
      }),
    ),
  );
  return { client, actions, onClose, ...view };
}
async function review() {
  fireEvent.click(
    await screen.findByRole("button", {
      name: i18n.t("managedWorktreeReview"),
    }),
  );
  expect(screen.getByText(target.worktreePath)).toBeTruthy();
  expect(screen.getByText(i18n.t("managedWorktreeConfirm"))).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: i18n.t("managedWorktreesBack") }),
  );
}
it("requires exact-path confirmation and displays native shared/active preservation reason", async () => {
  const h = mount();
  await review();
  expect(h.actions.releaseSessionWorktree).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: i18n.t("managedWorktreeRemove") }),
  );
  await screen.findByText(/another-native-session-references-worktree/);
  expect(h.actions.releaseSessionWorktree).toHaveBeenCalledWith(target);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: i18n.t("managedWorktreesBack") }),
  );
  expect(screen.getByText(target.worktreePath)).toBeTruthy();
  expect(screen.queryByText(i18n.t("managedWorktreeRemoved"))).toBeNull();
});
it("continues empty discovery pages and exposes unavailable records without calling them eligible", async () => {
  const h = mount();
  h.client.workspaceWorktrees.mockResolvedValueOnce({
    worktrees: [],
    truncated: true,
    nextCursor: "opaque-next",
    unavailable: 1,
  });
  // The initial request is already in flight; reopen represents reload discovery.
  h.unmount();
  render(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(ManagedWorktreesDialog, {
        workspace: "/project",
        client: h.client,
        actions: h.actions,
        connected: true,
        onClose: h.onClose,
      }),
    ),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: i18n.t("managedWorktreesMore") }),
  );
  await screen.findByText(target.worktreePath);
  expect(h.client.workspaceWorktrees).toHaveBeenLastCalledWith(
    "/project",
    "opaque-next",
  );
});
it("keeps an unknown outcome visible and permits an explicit retry instead of claiming removal", async () => {
  const h = mount();
  h.actions.releaseSessionWorktree.mockRejectedValueOnce(
    new Error("lost response"),
  );
  await review();
  fireEvent.click(
    screen.getByRole("button", { name: i18n.t("managedWorktreeRemove") }),
  );
  await screen.findByText(i18n.t("managedWorktreeUncertain"));
  expect(h.actions.releaseSessionWorktree).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: i18n.t("managedWorktreesRetry") }),
  );
  await waitFor(() =>
    expect(h.actions.releaseSessionWorktree).toHaveBeenCalledTimes(2),
  );
  expect(h.actions.releaseSessionWorktree).toHaveBeenLastCalledWith(target);
});
it("only removes the row after a confirmed removed result", async () => {
  const h = mount();
  h.actions.releaseSessionWorktree.mockResolvedValueOnce({
    ...target,
    commandId: "release",
    state: "removed",
  });
  await review();
  fireEvent.click(
    screen.getByRole("button", { name: i18n.t("managedWorktreeRemove") }),
  );
  await screen.findByText(i18n.t("managedWorktreeRemoved"));
  fireEvent.click(
    screen.getByRole("button", { name: i18n.t("managedWorktreesBack") }),
  );
  expect(screen.queryByText(target.worktreePath)).toBeNull();
});
