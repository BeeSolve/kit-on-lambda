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
  env: definedEnv(process.env),
  read: createReadableStream,
});

function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(env)) {
    if (value != null) entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

export const handler = asHttpV2Handler(async (request: Request) => {
  return server.respond(request, {
    getClientAddress() {
      return request.headers.get("x-forwarded-for") ?? "";
    },
  });
});
