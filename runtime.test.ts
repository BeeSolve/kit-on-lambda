import { describe, expect, it } from "bun:test";
import { toAwsContext, toAwsEvent } from "./runtime.js";

describe("toAwsEvent", () => {
  it("throws with a migration message", () => {
    expect(() => toAwsEvent(new Request("http://example.com"))).toThrow(
      "toAwsEvent is removed",
    );
  });
});

describe("toAwsContext", () => {
  it("throws with a migration message", () => {
    expect(() => toAwsContext(new Request("http://example.com"))).toThrow(
      "toAwsContext is removed",
    );
  });
});
