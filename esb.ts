import type { Adapter, Builder } from "@sveltejs/kit";
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

      builder.rimraf(out);
      builder.rimraf(tmp);
      builder.mkdirp(tmp);

      builder.log.minor("Copying assets");
      const clientFiles = builder.writeClient(
        `${out}/client${builder.config.kit.paths.base}`,
      );
      const prerenderedFiles = builder.writePrerendered(
        `${out}/prerendered${builder.config.kit.paths.base}`,
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

      writeFileSync(
        `${tmp}/manifest.js`,
        [
          `export const manifest = ${builder.generateManifest({ relativePath: "./" })};`,
          `export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
          `export const base = ${JSON.stringify(builder.config.kit.paths.base)};`,
        ].join("\n\n"),
      );

      const input: Record<string, string> = {
        index: `${tmp}/index.js`,
        manifest: `${tmp}/manifest.js`,
      };

      if (builder.hasServerInstrumentationFile?.()) {
        input["instrumentation.server"] = `${tmp}/instrumentation.server.js`;
      }

      await build({
        entryPoints: Object.values(input),
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

      builder.copy(`${files}/node`, `${out}/server`, {
        replace: {
          MANIFEST: "./manifest.js",
          SERVER: "./index.js",
        },
      });
      writeFileSync(
        `${out}/server/package.json`,
        JSON.stringify({ type: "module" }),
      );

      if (builder.hasServerInstrumentationFile?.()) {
        builder.instrument?.({
          entrypoint: `${out}/index.js`,
          instrumentation: `${out}/server/instrumentation.server.js`,
          module: {
            exports: ["path", "host", "port", "server"],
          },
        });
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
