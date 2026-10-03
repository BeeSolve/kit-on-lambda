import { writeFileSync } from "node:fs";

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  InMemorySpanExporter,
  type SpanProcessor,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

declare global {
  // Test seam installed only when `KOL_SPAN_SINK` is set (see below).
  // oxlint-disable-next-line no-var -- `var` is required to augment globalThis
  var __dumpSpans: (() => void) | undefined;
}

// The adapter guarantees this file runs before any application code, which is
// the ESM constraint OpenTelemetry needs: a module can only be auto-instrumented
// if it is patched before it is first imported.
//
// Note: we do NOT call `module.register('import-in-the-middle/hook.mjs', ...)`
// ourselves. The SvelteKit docs show that call, and on Node 24+/26 it emits
// `DEP0205 DeprecationWarning: module.register() is deprecated`. The OpenTelemetry
// SDK registers `import-in-the-middle` for us when we pass instrumentations, and
// a current `import-in-the-middle` (>= 3.5, as a transitive dependency of
// `@opentelemetry/instrumentation`) uses the synchronous, non-deprecated
// `module.registerHooks()` API where the Node version supports it. So keeping
// the OTel packages up to date is all that is required to stay free of DEP0205 —
// no manual loader registration, which would also double-register the hooks.

// Test seam: when `KOL_SPAN_SINK` points at a file path, capture finished spans
// in memory and dump their names to that file on demand (via a global hook the
// test calls after invoking the handler). This lets the adapter's test suite
// assert that first-party SvelteKit spans are emitted end-to-end, without a
// collector. In normal operation this branch is inert and the SDK exports OTLP.
const spanSinkPath = process.env.KOL_SPAN_SINK;
const spanProcessors: Array<SpanProcessor> = [];
if (spanSinkPath != null) {
  const exporter = new InMemorySpanExporter();
  spanProcessors.push(new SimpleSpanProcessor(exporter));
  globalThis.__dumpSpans = () => {
    const names = exporter.getFinishedSpans().map((span) => span.name);
    writeFileSync(spanSinkPath, JSON.stringify(names));
  };
}

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "kit-on-lambda-observability",
  // Exports OTLP/HTTP (protobuf) to `OTEL_EXPORTER_OTLP_ENDPOINT`. On Lambda this
  // is typically the ADOT collector extension at http://localhost:4318, which
  // forwards to X-Ray or any OTLP-compatible backend.
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
  ...(spanProcessors.length > 0 ? { spanProcessors } : {}),
});

sdk.start();
