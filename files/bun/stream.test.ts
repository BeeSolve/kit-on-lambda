import { expect, it, mock } from "bun:test";

(globalThis as unknown as Record<string, unknown>).awslambda = {
  streamifyResponse: (fn: unknown) => fn,
  HttpResponseStream: { from: (stream: unknown) => stream },
};

void mock.module("SERVER", () => ({
  Server: class {
    async init() {}
    respond = mock(async () => new Response("ok"));
  },
}));

void mock.module("MANIFEST", () => ({ manifest: {} }));

void mock.module("@sveltejs/kit/node", () => ({ createReadableStream: () => {} }));

const { handler } = await import("./stream.js");

it("exports handler as a function", () => {
  expect(typeof handler).toBe("function");
});
