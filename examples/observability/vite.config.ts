import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const adapterType = process.env.ADAPTER_TYPE ?? "esb";
const out = process.env.ADAPTER_OUT ?? "build";

// Keep OpenTelemetry packages unbundled so `import-in-the-middle` can patch them
// (and the modules they instrument) at runtime. The adapter resolves these
// patterns against the installed `node_modules`, pins the matched versions into
// `build/server/package.json`, and installs them into `build/server/node_modules`
// so they ship with the handler. SvelteKit's own first-party spans do not need
// this — they are emitted through the bare-specifier `@opentelemetry/api` the
// server bundle already shares — but third-party auto-instrumentation does.
const external = ["@opentelemetry/*", "import-in-the-middle", "require-in-the-middle"];

const adapter =
  adapterType === "bun"
    ? (await import("kit-on-lambda/bun")).default({ out, runtime: "node", external })
    : (await import("kit-on-lambda")).default({ out, external });

export default defineConfig(async () => ({
  // `tracing.server` turns on SvelteKit's first-party OpenTelemetry spans for the
  // handle hook, load functions, form actions, and remote functions.
  plugins: [await sveltekit({ adapter, tracing: { server: true } })],
}));
