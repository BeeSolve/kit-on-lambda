import { expect, it, mock } from "bun:test";

// awslambda is a Lambda runtime global; stub it for the test environment
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- stubbing a runtime-only global with simplified test fakes
(globalThis as unknown as Record<string, unknown>).awslambda = {
  streamifyResponse: (fn: unknown) => fn,
  HttpResponseStream: { from: (stream: unknown) => stream },
};

const respond = mock(async () => new Response("ok"));

void mock.module("SERVER", () => ({
  server: {
    async init() {},
    respond,
  },
}));

void mock.module("@sveltejs/kit/node", () => ({ createReadableStream: () => {} }));

const { handler } = await import("./stream.js");

it("exports handler as a function", () => {
  expect(typeof handler).toBe("function");
});

it("returns on a keep-active ping without writing to the stream or calling SvelteKit", async () => {
  const write = mock(() => {});
  const end = mock(() => {});

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keep-active pings arrive as a non-HTTP event payload
  const pingEvent = { $$keepActivePing$$: true } as unknown as Parameters<typeof handler>[0];

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the ping path never reads the context
  const context = {} as unknown as Parameters<typeof handler>[2];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal stream fake, the handler must not touch it
  const responseStream = { write, end } as unknown as Parameters<typeof handler>[1];

  await handler(pingEvent, responseStream, context);

  expect(respond).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(end).not.toHaveBeenCalled();
});
