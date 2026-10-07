import process from "node:process";

import { asHttpV2Handler } from "@beesolve/lambda-fetch-api";
import { protectFetch } from "@beesolve/lambda-function-url-protection/runtime";
import { keptActive } from "@beesolve/lambda-keep-active/runtime";
import { createReadableStream } from "@sveltejs/kit/node";
import { server } from "SERVER";

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

export const handler = keptActive(
  asHttpV2Handler(
    protectFetch(async (request: Request) => {
      return server.respond(request, {
        getClientAddress() {
          return request.headers.get("x-forwarded-for") ?? "";
        },
      });
    }),
  ),
);
