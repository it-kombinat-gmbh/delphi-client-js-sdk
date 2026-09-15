import { describe, expect, it } from "vitest";

import { sanitizeSdpIceCredentials } from "./sanitizeSdpIceCredentials";

const WELL_FORMED_UFRAG = "Wmsx";
const WELL_FORMED_PWD = "abcdefghijklmnopqrstuv";

function sdpWithCredentials(ufrag: string, pwd: string, eol = "\n"): string {
  return [
    "v=0",
    "o=- 0 0 IN IP4 127.0.0.1",
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    "a=fingerprint:sha-256 AA:BB",
  ].join(eol);
}

describe("sanitizeSdpIceCredentials leftovers-more", () => {
  it("leaves leftover-more well-formed ice-ufrag and ice-pwd unchanged", () => {
    const sdp = sdpWithCredentials(WELL_FORMED_UFRAG, WELL_FORMED_PWD);

    expect(sanitizeSdpIceCredentials(sdp)).toBe(sdp);
  });

  it("returns leftover-more SDP without ICE credentials unchanged", () => {
    const sdp = "v=0\no=- 0 0 IN IP4 127.0.0.1\na=fingerprint:sha-256 AA:BB\n";

    expect(sanitizeSdpIceCredentials(sdp)).toBe(sdp);
  });

  it("maps leftover-more URL-safe ice-ufrag and ice-pwd to the base64 alphabet", () => {
    expect(
      sanitizeSdpIceCredentials(
        sdpWithCredentials("a-b_", "c-d_efghijklmnopqrstuv"),
      ),
    ).toBe(sdpWithCredentials("a+b/", "c+d/efghijklmnopqrstuv"));
  });

  it("strips leftover-more ice-ufrag padding and other non-base64 characters", () => {
    expect(
      sanitizeSdpIceCredentials(
        sdpWithCredentials("abcd=======", WELL_FORMED_PWD),
      ),
    ).toBe(sdpWithCredentials("abcd", WELL_FORMED_PWD));
    expect(
      sanitizeSdpIceCredentials(sdpWithCredentials("ab!@#", WELL_FORMED_PWD)),
    ).toBe(sdpWithCredentials("abAA", WELL_FORMED_PWD));
  });

  it("pads leftover-more short ice-ufrag values to four characters", () => {
    expect(
      sanitizeSdpIceCredentials(sdpWithCredentials("ab", WELL_FORMED_PWD)),
    ).toBe(sdpWithCredentials("abAA", WELL_FORMED_PWD));
    expect(
      sanitizeSdpIceCredentials(sdpWithCredentials("xyz", WELL_FORMED_PWD)),
    ).toBe(sdpWithCredentials("xyzA", WELL_FORMED_PWD));
  });

  it("pads leftover-more short ice-pwd values to twenty-two characters", () => {
    expect(
      sanitizeSdpIceCredentials(sdpWithCredentials(WELL_FORMED_UFRAG, "short")),
    ).toBe(sdpWithCredentials(WELL_FORMED_UFRAG, `short${"A".repeat(17)}`));
    expect(
      sanitizeSdpIceCredentials(
        sdpWithCredentials(WELL_FORMED_UFRAG, "abcdefghijklmnopqrstu"),
      ),
    ).toBe(sdpWithCredentials(WELL_FORMED_UFRAG, "abcdefghijklmnopqrstuA"));
  });

  it("pads leftover-more credentials that clean to an empty string", () => {
    expect(sanitizeSdpIceCredentials(sdpWithCredentials("====", "!!!!"))).toBe(
      sdpWithCredentials("AAAA", "A".repeat(22)),
    );
  });

  it("repairs leftover-more ice attributes when the SDP uses CRLF line endings", () => {
    const input = sdpWithCredentials("ab", "xy", "\r\n");

    expect(sanitizeSdpIceCredentials(input)).toBe(
      sdpWithCredentials("abAA", `xy${"A".repeat(20)}`, "\r\n"),
    );
  });

  it("repairs leftover-more ice-ufrag and ice-pwd on every media section", () => {
    const sdp = [
      "v=0",
      "a=ice-ufrag:ab",
      "a=ice-pwd:one",
      "m=audio 9 UDP/TLS/RTP/SAVPF 8",
      "a=ice-ufrag:cd",
      "a=ice-pwd:two",
    ].join("\n");

    expect(sanitizeSdpIceCredentials(sdp)).toBe(
      [
        "v=0",
        "a=ice-ufrag:abAA",
        `a=ice-pwd:one${"A".repeat(19)}`,
        "m=audio 9 UDP/TLS/RTP/SAVPF 8",
        "a=ice-ufrag:cdAA",
        `a=ice-pwd:two${"A".repeat(19)}`,
      ].join("\n"),
    );
  });

  it("does not rewrite leftover-more neighboring SDP attributes", () => {
    const sdp = [
      "a=ice-options:trickle",
      "a=ice-lite",
      `a=ice-ufrag:${WELL_FORMED_UFRAG}`,
      `a=ice-pwd:${WELL_FORMED_PWD}`,
      "a=candidate:1 1 UDP 2130706431 127.0.0.1 9 typ host",
    ].join("\n");

    expect(sanitizeSdpIceCredentials(sdp)).toBe(sdp);
  });
});
