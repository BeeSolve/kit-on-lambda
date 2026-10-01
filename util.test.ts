import { describe, expect, it } from "bun:test";

import { assertUnreachable, computeRoutes } from "./util.js";

describe("assertUnreachable", () => {
  it("throws when called", () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentionally passing a non-never value to exercise the runtime guard
    expect(() => assertUnreachable("anything" as never)).toThrow("An unreachable state reached!");
  });

  it("includes the serialised value in the message", () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentionally passing a non-never value to exercise the runtime guard
    expect(() => assertUnreachable({ x: 1 } as never)).toThrow(JSON.stringify({ x: 1 }));
  });
});

describe("computeRoutes", () => {
  it("returns empty array for no files", () => {
    expect(computeRoutes([])).toEqual([]);
  });

  it("keeps root-level files as-is", () => {
    expect(computeRoutes(["favicon.ico", "robots.txt"])).toEqual(["favicon.ico", "robots.txt"]);
  });

  it("keeps a one-level-deep file as an exact route", () => {
    expect(computeRoutes(["_app/version.json"])).toEqual(["_app/version.json"]);
  });

  it("collapses files nested two or more levels deep to a two-segment wildcard", () => {
    expect(computeRoutes(["_app/immutable/chunks/vendor.js"])).toEqual(["_app/immutable/*"]);
  });

  it("deduplicates multiple files from the same nested directory", () => {
    expect(computeRoutes(["_app/immutable/a.js", "_app/immutable/b.js"])).toEqual([
      "_app/immutable/*",
    ]);
  });

  it("never emits a bare one-segment wildcard that would shadow dynamic _app routes", () => {
    // SvelteKit serves remote functions at `_app/remote/*` via the Lambda.
    // A greedy `_app/*` S3 route would shadow them; the computed routes must
    // not match that dynamic path so it falls through to the default behaviour.
    const routes = computeRoutes([
      "_app/version.json",
      "_app/immutable/entry/app.js",
      "_app/immutable/chunks/vendor.js",
    ]);
    expect(routes).not.toContain("_app/*");
    const matchesRemote = routes.some((route) =>
      route.endsWith("/*") ? "_app/remote/listGroups".startsWith(route.slice(0, -1)) : false,
    );
    expect(matchesRemote).toBe(false);
  });

  it("handles a mix of root files, one-level files, and nested files", () => {
    const files = [
      "favicon.ico",
      "_app/version.json",
      "_app/immutable/chunks/vendor.js",
      "about/index.html",
    ];
    expect(computeRoutes(files)).toEqual([
      "favicon.ico",
      "_app/version.json",
      "_app/immutable/*",
      "about/index.html",
    ]);
  });

  it("keeps a prerendered root document as an exact index.html route", () => {
    expect(computeRoutes(["index.html", "_app/immutable/entry/app.js"])).toEqual([
      "index.html",
      "_app/immutable/*",
    ]);
  });

  it("deduplicates wildcards from client and prerendered files in the same nested dir", () => {
    const clientFiles = ["_app/immutable/client.js"];
    const prerenderedFiles = ["_app/immutable/prerendered.js"];
    expect(computeRoutes([...clientFiles, ...prerenderedFiles])).toEqual(["_app/immutable/*"]);
  });
});
