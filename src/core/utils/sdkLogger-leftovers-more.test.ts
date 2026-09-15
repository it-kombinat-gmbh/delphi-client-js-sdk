import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Logger } from "../types";
import { logDebug, logger, setLogger } from "./sdkLogger";

const leftoverDebug = vi.fn();
const leftoverInfo = vi.fn();
const leftoverWarn = vi.fn();
const leftoverError = vi.fn();

function leftoverLogger(): Logger {
  return {
    debug: leftoverDebug,
    info: leftoverInfo,
    warn: leftoverWarn,
    error: leftoverError,
  };
}

beforeEach(() => {
  leftoverDebug.mockReset();
  leftoverInfo.mockReset();
  leftoverWarn.mockReset();
  leftoverError.mockReset();
  setLogger(undefined);
});

afterEach(() => {
  setLogger(undefined);
  vi.restoreAllMocks();
});

describe("logger leftovers-more default console", () => {
  it("routes leftover-more debug/info/warn/error to console when no custom logger is set", () => {
    const debug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    logger.debug("leftover-debug", 1);
    logger.info("leftover-info", { ok: true });
    logger.warn("leftover-warn");
    logger.error("leftover-error", new Error("leftover"));

    expect(debug).toHaveBeenCalledWith("leftover-debug", 1);
    expect(info).toHaveBeenCalledWith("leftover-info", { ok: true });
    expect(warn).toHaveBeenCalledWith("leftover-warn");
    expect(error).toHaveBeenCalledWith("leftover-error", expect.any(Error));
  });
});

describe("setLogger leftovers-more custom logger", () => {
  it("forwards leftover-more logger calls to the supplied leftover logger", () => {
    const custom = leftoverLogger();
    setLogger(custom);

    logger.debug("custom-debug");
    logger.info("custom-info", "extra");
    logger.warn("custom-warn");
    logger.error("custom-error", 42);

    expect(leftoverDebug).toHaveBeenCalledWith("custom-debug");
    expect(leftoverInfo).toHaveBeenCalledWith("custom-info", "extra");
    expect(leftoverWarn).toHaveBeenCalledWith("custom-warn");
    expect(leftoverError).toHaveBeenCalledWith("custom-error", 42);
    expect(leftoverDebug).toHaveBeenCalledTimes(1);
    expect(leftoverInfo).toHaveBeenCalledTimes(1);
    expect(leftoverWarn).toHaveBeenCalledTimes(1);
    expect(leftoverError).toHaveBeenCalledTimes(1);
  });

  it("reverts leftover-more to the default console logger when setLogger receives undefined", () => {
    const debug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    setLogger(leftoverLogger());
    logger.debug("before-revert");
    expect(leftoverDebug).toHaveBeenCalledWith("before-revert");
    expect(debug).not.toHaveBeenCalled();

    setLogger(undefined);
    logger.debug("after-revert");
    logger.info("after-revert-info");

    expect(leftoverDebug).toHaveBeenCalledTimes(1);
    expect(leftoverInfo).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith("after-revert");
    expect(info).toHaveBeenCalledWith("after-revert-info");
  });
});

describe("setLogger leftovers-more per-method fallback", () => {
  it("keeps leftover-more default console methods when a leftover logger omits them", () => {
    const debug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    setLogger({
      debug: leftoverDebug,
      info: undefined as unknown as Logger["info"],
      warn: leftoverWarn,
      error: undefined as unknown as Logger["error"],
    });

    logger.debug("partial-debug");
    logger.info("partial-info");
    logger.warn("partial-warn");
    logger.error("partial-error");

    expect(leftoverDebug).toHaveBeenCalledWith("partial-debug");
    expect(leftoverWarn).toHaveBeenCalledWith("partial-warn");
    expect(leftoverInfo).not.toHaveBeenCalled();
    expect(leftoverError).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("partial-info");
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("partial-error");
  });
});

describe("logDebug leftovers-more prefix", () => {
  it("prefixes leftover-more debug output with [DelphiClient] and forwards remaining args", () => {
    setLogger(leftoverLogger());

    logDebug("codec leftover", { preferPcma: true });
    logDebug();

    expect(leftoverDebug).toHaveBeenNthCalledWith(
      1,
      "[DelphiClient]",
      "codec leftover",
      {
        preferPcma: true,
      },
    );
    expect(leftoverDebug).toHaveBeenNthCalledWith(2, "[DelphiClient]");
    expect(leftoverInfo).not.toHaveBeenCalled();
  });

  it("routes leftover-more logDebug through the default console after revert", () => {
    const debug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);

    setLogger(leftoverLogger());
    setLogger(undefined);
    logDebug("reverted leftover");

    expect(leftoverDebug).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith("[DelphiClient]", "reverted leftover");
  });
});
