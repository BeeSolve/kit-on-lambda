import { describe, expect, it } from "bun:test";
import { assertUnreachable, computeRoutes } from "./util.js";

describe("assertUnreachable", () => {
  it("throws when called", () => {
    expect(() => assertUnreachable("anything" as never)).toThrow(
      "An unreachable state reached!",
    );
  });

  it("includes the serialised value in the message", () => {
    expect(() => assertUnreachable({ x: 1 } as never)).toThrow(
      JSON.stringify({ x: 1 }),
    );
  });
});

describe("computeRoutes", () => {
  it("returns empty array for no files", () => {
    expect(computeRoutes([])).toEqual([]);
  });

  it("keeps root-level files as-is", () => {
    expect(computeRoutes(["favicon.ico", "robots.txt"])).toEqual([
      "favicon.ico",
      "robots.txt",
    ]);
  });

  it("converts a one-level-deep directory to a wildcard", () => {
    expect(computeRoutes(["_app/bundle.js"])).toEqual(["_app/*"]);
  });

  it("excludes files nested more than one level deep", () => {
    expect(computeRoutes(["_app/immutable/chunks/vendor.js"])).toEqual([]);
  });

  it("deduplicates multiple files from the same directory", () => {
    expect(computeRoutes(["_app/a.js", "_app/b.js", "_app/c.js"])).toEqual([
      "_app/*",
    ]);
  });

  it("handles a mix of root files, shallow dirs, and nested files", () => {
    const files = [
      "favicon.ico",
      "_app/bundle.js",
      "_app/immutable/chunks/vendor.js",
      "about/index.html",
    ];
    expect(computeRoutes(files)).toEqual([
      "favicon.ico",
      "_app/*",
      "about/*",
    ]);
  });

  it("deduplicates wildcards from client and prerendered files in the same dir", () => {
    const clientFiles = ["_app/client.js"];
    const prerenderedFiles = ["_app/prerendered.js"];
    expect(computeRoutes([...clientFiles, ...prerenderedFiles])).toEqual([
      "_app/*",
    ]);
  });
});
