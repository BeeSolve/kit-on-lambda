---
"kit-on-lambda": patch
---

Answer keep-active pings in the streaming handlers. `stream.ts` for both the Node.js and Bun runtimes now wraps the handler with `keptActiveStreaming`, so the `$$keepActivePing$$` event no longer reaches `asResponseStreamHandler`, where it failed as a malformed HTTP event and raised Lambda `Errors` with async retries. Upgrade `@beesolve/lambda-keep-active` to `^2.2.0`.
