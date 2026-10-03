# kit-on-lambda — observability example

A minimal SvelteKit 3 app wired for OpenTelemetry tracing on AWS Lambda through
`kit-on-lambda`. It demonstrates the full chain:

1. `tracing: { server: true }` in `vite.config.ts` turns on SvelteKit's
   first-party spans (handle hook, load functions, form actions, remote
   functions).
2. `src/instrumentation.server.ts` starts an OpenTelemetry `NodeSDK`. The adapter
   guarantees this file loads before any application code.
3. The adapter's `external` option keeps the OpenTelemetry packages unbundled so
   `import-in-the-middle` can auto-instrument third-party modules at runtime, and
   installs them into `build/server/node_modules` so they ship with the handler.

A request to `/` emits `sveltekit.handle.root` → `sveltekit.resolve` →
`sveltekit.load`.

## Why `external`?

SvelteKit's own spans are emitted through the bare-specifier `@opentelemetry/api`
that the server bundle already shares, so they work even when everything is
bundled. Third-party auto-instrumentation is different: `import-in-the-middle`
can only patch modules that are still real runtime `import`s. If the OTel
packages are inlined into the server bundle there is nothing left to intercept.
Listing them in `external` keeps them as runtime imports:

```ts
const external = ["@opentelemetry/*", "import-in-the-middle", "require-in-the-middle"];
```

The adapter resolves those patterns against the installed `node_modules`, pins
the matched versions into `build/server/package.json`, and installs them into
`build/server/node_modules`.

> The `@opentelemetry/*` glob matches every installed `@opentelemetry/...`
> package, which — with `getNodeAutoInstrumentations()` — is dozens of packages.
> For a leaner bundle, replace the glob with the specific instrumentations you
> use (e.g. `@opentelemetry/instrumentation-http`).

## No `module.register()` / no DEP0205

The SvelteKit docs show a manual
`module.register('import-in-the-middle/hook.mjs', ...)` call. On Node 24+/26 that
emits `DEP0205 DeprecationWarning: module.register() is deprecated`. This example
does **not** call it: the OpenTelemetry SDK registers `import-in-the-middle`
itself, and a current `import-in-the-middle` uses the synchronous, non-deprecated
`module.registerHooks()` API where the runtime supports it. Keep the OTel
packages current and no deprecation warning appears.

## Build

```bash
# esbuild + Node.js runtime (default)
bun run build

# Bun bundler + Node.js runtime
ADAPTER_TYPE=bun bun run build
```

## Collecting traces on Lambda

Point the exporter at a collector. The usual setup is the AWS Distro for
OpenTelemetry (ADOT) Lambda layer, which runs a collector at
`http://localhost:4318`; set `OTEL_EXPORTER_OTLP_ENDPOINT` (and
`OTEL_SERVICE_NAME`) on the function. Any OTLP/HTTP backend works.
