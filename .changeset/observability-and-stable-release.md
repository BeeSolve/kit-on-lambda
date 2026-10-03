---
"kit-on-lambda": major
---

First stable release. Targets SvelteKit 3 and adds first-class OpenTelemetry observability support.

**SvelteKit 3**

- Requires `@sveltejs/kit@^3.0.0`. SvelteKit 2 is no longer supported.

**Observability (OpenTelemetry)**

- Fully support SvelteKit 3's integrated observability on Lambda. When `tracing.server` is enabled and a `src/instrumentation.server.ts` file is present, the adapter emits the instrumentation entry, generates the environment initializer, and wires `builder.instrument(...)` so the instrumentation is guaranteed to load before application code on both the buffered and streaming handlers. First-party `sveltekit.handle.*`, `sveltekit.resolve`, and `sveltekit.load` spans flow through to your OpenTelemetry SDK.
- Add an `external` build option to both the esbuild (`kit-on-lambda`) and Bun (`kit-on-lambda/bun`) adapters. Listed packages (literal names or trailing-`*` prefixes such as `@opentelemetry/*`) are left unbundled, pinned into `build/server/package.json`, and installed into `build/server/node_modules` so they ship with the handler. This is required for `import-in-the-middle`-based auto-instrumentation, which can only patch modules that remain real runtime `import`s.
- Document the full setup in the README and add a runnable `examples/observability` reference app. Notably: do **not** call `module.register("import-in-the-middle/hook.mjs", ...)` yourself — the OpenTelemetry SDK registers `import-in-the-middle` for you, and a current `import-in-the-middle` uses the non-deprecated `module.registerHooks()` API, avoiding the Node `DEP0205` deprecation warning.

**Notes**

- `@beesolve/lambda-fetch-api` no longer needs `ssr.external` in your Vite config. The adapter builds the Lambda handler and SvelteKit's SSR server as a single bundle, so the package is deduplicated into one module instance and its `AsyncLocalStorage` store is shared automatically.
