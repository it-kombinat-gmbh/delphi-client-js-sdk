import { describe, expect, it } from "vitest";

import {
  StandardActions,
  getChannelStream,
  getToAriChannel,
  getToBrowserChannel,
} from "./channelTypes";

const LEFTOVER_SESSION = "sess-leftover-more-1";
const LEFTOVER_EMPTY = "";
const LEFTOVER_COLON = "team:sess:99";
const LEFTOVER_UUID = "11111111-1111-4111-8111-111111111111";

describe("getToAriChannel leftovers-more", () => {
  it("builds leftover-more to-ARI keys for ordinary and leftover session ids", () => {
    expect(getToAriChannel(LEFTOVER_SESSION)).toBe(
      "voiceai:channel:sess-leftover-more-1:to_ari",
    );
    expect(getToAriChannel(LEFTOVER_UUID)).toBe(
      `voiceai:channel:${LEFTOVER_UUID}:to_ari`,
    );
    expect(getToAriChannel(LEFTOVER_COLON)).toBe(
      "voiceai:channel:team:sess:99:to_ari",
    );
    expect(getToAriChannel(LEFTOVER_EMPTY)).toBe("voiceai:channel::to_ari");
  });
});

describe("getToBrowserChannel leftovers-more", () => {
  it("builds leftover-more to-browser keys for ordinary and leftover session ids", () => {
    expect(getToBrowserChannel(LEFTOVER_SESSION)).toBe(
      "voiceai:channel:sess-leftover-more-1:to_browser",
    );
    expect(getToBrowserChannel(LEFTOVER_UUID)).toBe(
      `voiceai:channel:${LEFTOVER_UUID}:to_browser`,
    );
    expect(getToBrowserChannel(LEFTOVER_COLON)).toBe(
      "voiceai:channel:team:sess:99:to_browser",
    );
    expect(getToBrowserChannel(LEFTOVER_EMPTY)).toBe(
      "voiceai:channel::to_browser",
    );
  });
});

describe("getChannelStream leftovers-more", () => {
  it("builds leftover-more stream keys for ordinary and leftover session ids", () => {
    expect(getChannelStream(LEFTOVER_SESSION)).toBe(
      "voiceai:stream:sess-leftover-more-1",
    );
    expect(getChannelStream(LEFTOVER_UUID)).toBe(
      `voiceai:stream:${LEFTOVER_UUID}`,
    );
    expect(getChannelStream(LEFTOVER_COLON)).toBe(
      "voiceai:stream:team:sess:99",
    );
    expect(getChannelStream(LEFTOVER_EMPTY)).toBe("voiceai:stream:");
  });
});

describe("StandardActions leftovers-more", () => {
  it("exposes leftover-more standard action names the browser should handle", () => {
    expect(StandardActions).toEqual({
      FILL_FORM: "fill_form",
      CLICK_ELEMENT: "click_element",
      NAVIGATE: "navigate",
      NAVIGATE_CURRENT: "navigate_current",
      SHOW_ALERT: "show_alert",
      SHOW_CONFIRM: "show_confirm",
      SHOW_PROMPT: "show_prompt",
      SHOW_NOTIFICATION: "show_notification",
      OPEN_MODAL: "open_modal",
      CLOSE_MODAL: "close_modal",
      SCROLL_TO: "scroll_to",
      SET_STORAGE: "set_storage",
      GET_STORAGE: "get_storage",
      DOWNLOAD_FILE: "download_file",
      COPY_TO_CLIPBOARD: "copy_to_clipboard",
      PLAY_AUDIO: "play_audio",
      STOP_AUDIO: "stop_audio",
      CUSTOM: "custom",
    });
  });

  it("keeps leftover-more StandardActions keys aligned with their string values", () => {
    const leftoverPairs = Object.entries(StandardActions);
    expect(leftoverPairs).toHaveLength(18);
    for (const [key, value] of leftoverPairs) {
      expect(StandardActions[key as keyof typeof StandardActions]).toBe(value);
      expect(typeof value).toBe("string");
    }
  });
});
