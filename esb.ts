import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Adapter, Builder } from "@sveltejs/kit";
import { build } from "esbuild";

import {
  computeRoutes,
  detectPackageManager,
  installCommand,
  resolveExternalDependencies,
} from "./util.js";

interface AdapterOptions {
  /**
   * @default "build"
   */
  out?: string;
  /**
   * @default true
   */
  precompress?: boolean;
  /**
   * esbuild can only build for "node"
   *
   * @default "node"
   */
  runtime?: "node";
  /**
   * Packages to leave unbundled (passed through to esbuild's `external`).
   *
   * The server is otherwise fully bundled. Mark a dependency external when it
   * must stay a runtime `import` rather than being inlined — most notably for
   * OpenTelemetry auto-instrumentation: `import-in-the-middle` can only patch
   * modules that are still real `import`s at runtime, so packages you want
   * auto-instrumented (and the instrumentation packages themselves) must be
   * listed here and shipped in `node_modules` alongside the handler.
   *
   * @example ["@opentelemetry/*", "import-in-the-middle", "require-in-the-middle"]
   * @default []
   */
  external?: Array<string>;
  /**
   * Options for esbuild build
   */
  buildOptions?: {
    /**
     * @default true
     */
    minify?: boolean;
    /**
     * @default "linked"
     */
    sourcemap?: "linked" | "none" | "inline" | "external";
  };
}

const files = fileURLToPath(new URL("./files", import.meta.url).href);

export default (options: AdapterOptions = {}): Adapter => {
  const { out = "build", precompress = true, external = [] } = options;
  const sourcemap = options.buildOptions?.sourcemap ?? "linked";

  return {
    name: "kit-on-lambda",
    async adapt(builder: Builder) {
      const tmp = builder.getBuildDirectory("adapter-esbuild-build-lambda");

      rmSync(out, { force: true, recursive: true });
      rmSync(tmp, { force: true, recursive: true });
      mkdirSync(tmp, { recursive: true });

      builder.log.minor("Copying assets");
      const clientFiles = builder.writeClient(`${out}/client${builder.config.paths.base}`);
      const prerenderedFiles = builder.writePrerendered(
        `${out}/prerendered${builder.config.paths.base}`,
      );

      if (precompress) {
        builder.log.minor("Compressing assets");
        await Promise.all([
          builder.compress(`${out}/client`),
          builder.compress(`${out}/prerendered`),
        ]);
      }

      builder.log.minor("Building server");

      builder.writeServer(tmp);
      builder.generateServerInstance(`${tmp}/server.js`, { serverDirectory: tmp });

      const substitute = (src: string) => src.replaceAll('"SERVER"', '"./server.js"');

      writeFileSync(
        `${tmp}/handler.ts`,
        substitute(readFileSync(`${files}/node/handler.ts`, "utf8")),
      );
      writeFileSync(
        `${tmp}/stream.ts`,
        substitute(readFileSync(`${files}/node/stream.ts`, "utf8")),
      );

      const input: Record<string, string> = {
        handler: `${tmp}/handler.ts`,
        stream: `${tmp}/stream.ts`,
      };

      const hasInstrumentation = builder.hasServerInstrumentationFile();
      let initializer: string | undefined;

      if (hasInstrumentation) {
        input["instrumentation.server"] = `${tmp}/instrumentation.server.js`;
        initializer = builder.createInstrumentationInitializer({
          outputDirectory: tmp,
          serverDirectory: tmp,
        });
        input["instrumentation.init"] = initializer;
      }

      await build({
        entryPoints: input,
        format: "esm",
        charset: "utf8",
        mainFields: ["module", "main"],
        resolveExtensions: [".ts", ".mjs", ".js", ".json"],
        external,
        target: "node24",
        bundle: true,
        platform: "node",
        outdir: `${out}/server`,
        minify: options.buildOptions?.minify ?? true,
        minifyIdentifiers: true,
        legalComments: "none",
        keepNames: true,
        splitting: true,
        treeShaking: true,
        sourcemap: sourcemap === "none" ? undefined : sourcemap,
        sourcesContent: false,
        banner: {
          js: `/* CommonJS polyfills */import { fileURLToPath } from 'node:url';import { createRequire } from 'node:module';const __filename = fileURLToPath(import.meta.url);const __dirname = fileURLToPath(new URL('.', import.meta.url));const require = createRequire(import.meta.url);/* end of CommonJS polyfills */`,
        },
      });

      writeExternalManifest({
        builder,
        external,
        serverDir: `${out}/server`,
      });

      if (hasInstrumentation && initializer != null) {
        for (const entry of ["handler", "stream"]) {
          builder.instrument({
            entrypoint: `${out}/server/${entry}.js`,
            instrumentation: `${out}/server/instrumentation.server.js`,
            initializer: `${out}/server/instrumentation.init.js`,
            start: `${out}/server/${entry}.start.js`,
            module: {
              exports: ["handler"],
            },
          });
        }
      }

      writeFileSync(
        join(out, "routes.json"),
        JSON.stringify(computeRoutes([...clientFiles, ...prerenderedFiles])),
      );
    },

    supports: {
      read: () => true,
      instrumentation: () => true,
    },
  };
};

/**
 * Write `server/package.json`. The server bundle is always ESM, so it always
 * declares `"type": "module"`. When the adapter was given `external` packages,
 * those are resolved to pinned versions and installed into `server/node_modules`
 * so they are shipped alongside the handler (the Lambda bundles the whole
 * `server/` directory). This is required for OpenTelemetry auto-instrumentation,
 * which can only patch packages that remain real runtime `import`s.
 */
function writeExternalManifest(props: {
  builder: Builder;
  external: Array<string>;
  serverDir: string;
}): void {
  const { builder, external, serverDir } = props;

  const dependencies = resolveExternalDependencies({
    external,
    nodeModulesDir: join(process.cwd(), "node_modules"),
  });

  writeFileSync(
    join(serverDir, "package.json"),
    JSON.stringify({ type: "module", private: true, dependencies }, null, 2),
  );

  const names = Object.keys(dependencies);
  if (names.length === 0) return;

  const manager = detectPackageManager(process.cwd());
  const [command, ...args] = installCommand(manager);
  builder.log.minor(`Installing ${names.length} external package(s) into server/ with ${manager}`);
  if (command == null) return;
  execFileSync(command, args, { cwd: serverDir, stdio: "inherit" });
}
