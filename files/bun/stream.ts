import process from "node:process";

// Bun streaming is not yet supported — using HTTP v2 handler as fallback.
// See files/bun/stream.future.ts for the streaming implementation to restore
// once @beesolve/lambda-bun-runtime implements the streaming protocol.
import { asHttpV2Handler } from "@beesolve/lambda-fetch-api";
import { createReadableStream } from "@sveltejs/kit/node";
import { manifest } from "MANIFEST";
import { Server } from "SERVER";

const server = new Server(manifest);

await server.init({
  env: process.env as Record<string, string>,
  read: createReadableStream,
});

export const handler = asHttpV2Handler(async (request: Request) => {
  return server.respond(request, {
    getClientAddress() {
      return request.headers.get("x-forwarded-for") ?? "";
    },
  });
});
