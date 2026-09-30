import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Adapter, Builder } from "@sveltejs/kit";
import { build } from "esbuild";

import { computeRoutes } from "./util.js";

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
  const { out = "build", precompress = true } = options;
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
        external: [],
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

      writeFileSync(`${out}/server/package.json`, JSON.stringify({ type: "module" }));

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
