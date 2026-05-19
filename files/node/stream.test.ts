import { expect, it, mock } from "bun:test";

// awslambda is a Lambda runtime global; stub it for the test environment
(globalThis as any).awslambda = {
  streamifyResponse: (fn: unknown) => fn,
  HttpResponseStream: { from: (stream: unknown) => stream },
};

mock.module("SERVER", () => ({
  Server: class {
    async init() {}
    respond = mock(async () => new Response("ok"));
  },
}));

mock.module("MANIFEST", () => ({ manifest: {} }));

mock.module("@sveltejs/kit/node", () => ({ createReadableStream: () => {} }));

const { handler } = await import("./stream.js");

it("exports handler as a function", () => {
  expect(typeof handler).toBe("function");
});
