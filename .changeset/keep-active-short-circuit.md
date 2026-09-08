---
"kit-on-lambda": patch
---

Short-circuit keep-active pings in the shipped Lambda handlers so they no longer trigger a spurious SvelteKit render.

The `SvelteKit` construct already tags its handler for warming via `LambdaKeepActive`, but the node and bun handler templates passed the keep-active ping event straight into `awsRequest`/`server.respond`, rendering a garbage request on every warm invocation.

- Wrap the node handler with `keptActive` at the event level.
- Wrap the bun handler with `keptActive` around `asHttpV2Handler`, since the ping arrives as a raw Lambda event rather than as an HTTP request.
- Add handler tests asserting a keep-active ping short-circuits without calling `server.respond`.
