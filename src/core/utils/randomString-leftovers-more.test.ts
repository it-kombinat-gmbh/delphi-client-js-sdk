import { afterEach, describe, expect, it, vi } from "vitest";

import { randomString } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

function leftoverFill(values: number[]) {
  return vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
    const target = array as Uint32Array;
    for (let i = 0; i < values.length && i < target.length; i++) {
      target[i] = values[i]!;
    }
    return array;
  });
}

describe("randomString leftovers-more charset mapping", () => {
  it("maps leftover-more getRandomValues through the 62-char alphabet", () => {
    leftoverFill([0, 25, 26, 51, 52, 61]);

    expect(randomString(6)).toBe("AZaz09");
  });

  it("wraps leftover-more values at the charset length", () => {
    leftoverFill([62, 63, 123, 124]);

    expect(randomString(4)).toBe("AB9A");
  });
});

describe("randomString leftovers-more getRandomValues", () => {
  it("passes leftover-more a Uint32Array of the requested length", () => {
    const spy = leftoverFill([0, 1, 2]);

    expect(randomString(3)).toBe("ABC");
    expect(spy).toHaveBeenCalledTimes(1);
    const typed = spy.mock.calls[0]![0];
    expect(typed).toBeInstanceOf(Uint32Array);
    expect(typed).toHaveLength(3);
  });

  it("still calls leftover-more getRandomValues for length 0 and returns empty", () => {
    const spy = leftoverFill([]);

    expect(randomString(0)).toBe("");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toBeInstanceOf(Uint32Array);
    expect(spy.mock.calls[0]![0]).toHaveLength(0);
  });
});

describe("randomString leftovers-more invalid lengths", () => {
  it("throws leftover-more RangeError for a negative length", () => {
    expect(() => randomString(-1)).toThrow(RangeError);
  });

  it("truncates leftover-more fractional lengths on the TypedArray then keeps the original loop bound", () => {
    leftoverFill([1, 2]);

    expect(randomString(2.7)).toBe("BCA");
  });
});
