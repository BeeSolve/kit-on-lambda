// Streaming implementation for Bun runtime.
// Disabled until @beesolve/lambda-bun-runtime implements the Lambda
// custom-runtime streaming protocol in its runtime.js bootstrap.
// Restore by replacing files/bun/stream.ts with this file's contents.
import { asResponseStreamHandler } from "@beesolve/lambda-fetch-api";
import { createReadableStream } from "@sveltejs/kit/node";
import { manifest } from "MANIFEST";
import process from "node:process";
import { Server } from "SERVER";

const server = new Server(manifest);
await server.init({
  env: process.env as Record<string, string>,
  read: createReadableStream,
});

export const handler = asResponseStreamHandler(async (request: Request) => {
  return server.respond(request, {
    getClientAddress() {
      return request.headers.get("x-forwarded-for") ?? "";
    },
  });
});
