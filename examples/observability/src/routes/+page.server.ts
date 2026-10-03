// This server `load` runs inside the handle hook, so a request to `/` emits
// `sveltekit.handle.root` → `sveltekit.resolve` → `sveltekit.load` spans once
// `tracing.server` is enabled and `instrumentation.server.ts` starts an SDK.
export function load() {
  return {
    runtime: process.version,
    timestamp: new Date().toISOString(),
  };
}
