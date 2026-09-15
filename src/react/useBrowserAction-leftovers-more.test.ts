import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

import type { ActionPayload } from "../core/channelTypes";
import { useBrowserAction } from "./useBrowserAction";

function leftoverAction(
  name: string,
  parameters: Record<string, unknown> = {},
): ActionPayload {
  return {
    actionId: "act-leftover",
    name,
    parameters,
    requiresResponse: true,
  };
}

function installLeftoverWindow() {
  const open = vi.fn(() => null);
  const pushState = vi.fn();
  const dispatchEvent = vi.fn(() => true);
  const alertFn = vi.fn();
  const confirmFn = vi.fn(() => false);
  const promptFn = vi.fn(() => null);
  const location = {
    origin: "http://localhost:5173",
    href: "http://localhost:5173/demo/home",
  };

  vi.stubGlobal("window", {
    open,
    history: { pushState },
    dispatchEvent,
    location,
    alert: alertFn,
    confirm: confirmFn,
    prompt: promptFn,
  });
  vi.stubGlobal("alert", alertFn);
  vi.stubGlobal("confirm", confirmFn);
  vi.stubGlobal("prompt", promptFn);
  vi.stubGlobal(
    "PopStateEvent",
    class PopStateEvent {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    },
  );

  return {
    open,
    pushState,
    dispatchEvent,
    location,
    alertFn,
    confirmFn,
    promptFn,
  };
}

describe("useBrowserAction leftovers-more", () => {
  let mocks: ReturnType<typeof installLeftoverWindow>;

  beforeEach(() => {
    mocks = installLeftoverWindow();
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("passes leftover-more omitted options through to history navigation", async () => {
    const onAction = useBrowserAction();

    await expect(
      onAction(leftoverAction("navigate_current", { url: "/leftover" })),
    ).resolves.toEqual({
      success: true,
      data: { url: "/leftover", method: "history" },
    });
    expect(mocks.pushState).toHaveBeenCalledWith({}, "", "/leftover");
    expect(mocks.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("treats leftover-more bare navigate callbacks as onNavigate", async () => {
    const onNavigate = vi.fn();
    const onAction = useBrowserAction(onNavigate);

    await expect(
      onAction(leftoverAction("navigate_current", { url: "/leftover-fn" })),
    ).resolves.toEqual({
      success: true,
      data: { url: "/leftover-fn", method: "callback" },
    });
    expect(onNavigate).toHaveBeenCalledWith("/leftover-fn");
    expect(mocks.pushState).not.toHaveBeenCalled();
  });

  it("forwards leftover-more options objects including customHandlers", async () => {
    const onNavigate = vi.fn();
    const leftoverCustom = vi.fn(async () => ({
      success: true,
      data: { leftover: true },
    }));
    const onAction = useBrowserAction({
      onNavigate,
      customHandlers: { leftover_search: leftoverCustom },
    });

    await expect(
      onAction(leftoverAction("leftover_search", { query: "widgets" })),
    ).resolves.toEqual({
      success: true,
      data: { leftover: true },
    });
    expect(leftoverCustom).toHaveBeenCalledWith(
      leftoverAction("leftover_search", { query: "widgets" }),
    );

    await expect(
      onAction(
        leftoverAction("navigate", { url: "/leftover-self", target: "_self" }),
      ),
    ).resolves.toEqual({
      success: true,
      data: { url: "/leftover-self", method: "callback" },
    });
    expect(onNavigate).toHaveBeenCalledWith("/leftover-self");
  });

  it("awaits leftover-more dialog actions and missing-url failures", async () => {
    const onAction = useBrowserAction();

    await expect(
      onAction(leftoverAction("show_alert", { message: "leftover alert" })),
    ).resolves.toEqual({
      success: true,
      data: { dismissed: true },
    });
    expect(mocks.alertFn).toHaveBeenCalledWith("leftover alert");

    await expect(
      onAction(leftoverAction("show_confirm", { message: "leftover confirm" })),
    ).resolves.toEqual({
      success: true,
      data: { confirmed: false },
    });
    expect(mocks.confirmFn).toHaveBeenCalledWith("leftover confirm");

    await expect(
      onAction(leftoverAction("show_prompt", { message: "leftover prompt" })),
    ).resolves.toEqual({
      success: true,
      data: { value: null, cancelled: true },
    });
    expect(mocks.promptFn).toHaveBeenCalledWith("leftover prompt", "");

    await expect(onAction(leftoverAction("navigate", {}))).resolves.toEqual({
      success: false,
      error: "No URL provided",
    });
    await expect(
      onAction(leftoverAction("navigate_current", {})),
    ).resolves.toEqual({
      success: false,
      error: "No URL provided",
    });
  });

  it("awaits leftover-more unknown actions and onUnknownAction", async () => {
    const onAction = useBrowserAction();
    await expect(
      onAction(leftoverAction("not_a_real_action", { leftover: 1 })),
    ).resolves.toEqual({
      success: false,
      error: "Unknown action: not_a_real_action",
    });

    const onUnknownAction = vi.fn(async () => ({
      async: true as const,
      message: "leftover pending",
    }));
    const leftoverUnknown = useBrowserAction({ onUnknownAction });
    await expect(
      leftoverUnknown(leftoverAction("still_unknown")),
    ).resolves.toEqual({
      async: true,
      message: "leftover pending",
    });
    expect(onUnknownAction).toHaveBeenCalledWith(
      leftoverAction("still_unknown"),
    );
  });

  it("opens leftover-more navigate targets in a new tab by default", async () => {
    const onAction = useBrowserAction();

    await expect(
      onAction(
        leftoverAction("navigate", { url: "https://leftover.example/x" }),
      ),
    ).resolves.toEqual({
      success: true,
      data: {
        url: "https://leftover.example/x",
        target: "_blank",
        method: "window_open",
      },
    });
    expect(mocks.open).toHaveBeenCalledWith(
      "https://leftover.example/x",
      "_blank",
    );
  });
});
