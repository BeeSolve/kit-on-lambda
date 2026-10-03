import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");
const exampleDir = join(repoRoot, "examples/observability");
const invoker = join(__dirname, "invoke-handler.ts");

// The example must have its OpenTelemetry dependencies installed for this test to
// run (CI installs it in the verify job). Skip cleanly when it is not installed
// so a bare `bun test` on a fresh checkout does not fail.
const exampleInstalled = existsSync(join(exampleDir, "node_modules/@opentelemetry/sdk-node"));

function describeMaybe(label: string, fn: () => void) {
  if (exampleInstalled) {
    describe(label, fn);
  } else {
    describe.skip(`[skipped — run \`bun install --cwd examples/observability\`] ${label}`, fn);
  }
}

function buildExample(props: { adapterType: "esb" | "bun"; out: string }): void {
  const result = spawnSync("bun", ["--bun", "run", "build"], {
    cwd: exampleDir,
    env: { ...process.env, ADAPTER_TYPE: props.adapterType, ADAPTER_OUT: props.out },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`observability example build failed for ADAPTER_TYPE=${props.adapterType}`);
  }
}

function invokeAndReadSpans(props: { handlerPath: string }): {
  status: number;
  dep0205: boolean;
  spans: Array<string>;
} {
  const spanSink = join(mkdtempSync(join(tmpdir(), "kol-spans-")), "spans.json");
  const result = spawnSync("bun", ["run", invoker, props.handlerPath], {
    cwd: exampleDir,
    env: { ...process.env, KOL_SPAN_SINK: spanSink, OTEL_SDK_DISABLED: "false" },
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`handler invocation failed:\n${result.stdout}\n${result.stderr}`);
  }

  const match = /status=(\d+) dep0205=(true|false)/.exec(result.stdout);
  if (match == null) {
    throw new Error(`could not parse invoker output:\n${result.stdout}\n${result.stderr}`);
  }

  const spans: Array<string> = JSON.parse(readFileSync(spanSink, "utf8"));
  rmSync(dirname(spanSink), { recursive: true, force: true });

  return {
    status: Number(match[1]),
    dep0205: match[2] === "true",
    spans,
  };
}

function suite(label: string, adapterType: "esb" | "bun") {
  describeMaybe(label, () => {
    const out = `build-otel-${adapterType}`;
    const handlerPath = join(exampleDir, out, "server/handler.js");

    test(
      "builds, serves a traced request, and emits first-party SvelteKit spans",
      () => {
        buildExample({ adapterType, out });
        const { status, dep0205, spans } = invokeAndReadSpans({ handlerPath });

        expect(status).toBe(200);

        // The OpenTelemetry SDK registers import-in-the-middle itself using the
        // non-deprecated module.registerHooks() path on supported runtimes, so no
        // DEP0205 warning should be emitted. Manually calling module.register()
        // (as the SvelteKit docs show) would trip this.
        expect(dep0205).toBe(false);

        // A GET / runs the handle hook, resolve, and the +page.server.ts load.
        expect(spans).toContain("sveltekit.handle.root");
        expect(spans).toContain("sveltekit.resolve");
        expect(spans).toContain("sveltekit.load");
      },
      5 * 60 * 1000,
    );
  });
}

suite("Observability: esbuild + Node.js", "esb");
suite("Observability: Bun bundler + Node.js", "bun");
