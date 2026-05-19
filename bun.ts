import type { Adapter, Builder } from "@sveltejs/kit";
import { readFileSync, writeFileSync } from "node:fs";
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
   * With Bun you can choose if you want to build fro "bun" or "node" runtime
   *
   * @default "bun"
   */
  runtime?: "bun" | "node";
  /**
   * Options for Bun build
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
  const { out = "build", precompress = true, runtime = "bun" } = options;

  return {
    name: "kit-on-lambda",
    async adapt(builder: Builder) {
      const tmp = builder.getBuildDirectory("adapter-bun-build-lambda");

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

      const pkg = JSON.parse(readFileSync("package.json", "utf8"));

      const substitute = (src: string) =>
        src
          .replaceAll('"SERVER"', '"./index.js"')
          .replaceAll('"MANIFEST"', '"./manifest.js"');

      writeFileSync(
        `${tmp}/handler.ts`,
        substitute(readFileSync(`${files}/${runtime}/handler.ts`, "utf8")),
      );
      writeFileSync(
        `${tmp}/stream.ts`,
        substitute(readFileSync(`${files}/${runtime}/stream.ts`, "utf8")),
      );

      const input: Record<string, string> = {
        index: `${tmp}/index.js`,
        manifest: `${tmp}/manifest.js`,
        handler: `${tmp}/handler.ts`,
        stream: `${tmp}/stream.ts`,
      };

      if (builder.hasServerInstrumentationFile?.()) {
        input["instrumentation.server"] = `${tmp}/instrumentation.server.js`;
      }

      const result = await Bun.build({
        entrypoints: Object.values(input),
        external: [
          // dependencies could have deep exports, so we need a regex
          ...Object.keys(pkg.dependencies || {}).map((d) =>
            new RegExp(`^${d}(\\/.*)?$`).toString(),
          ),
        ],
        target: runtime,
        minify: options.buildOptions?.minify ?? true,
        outdir: `${out}/server`,
        splitting: true,
        sourcemap: options.buildOptions?.sourcemap ?? "linked",
      });

      if (!result.success) {
        console.error("Build failed:", result.logs);
        process.exit(1);
      }

      if (runtime === "node") {
        writeFileSync(
          `${out}/server/package.json`,
          JSON.stringify({ type: "module" }),
        );
      }

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
