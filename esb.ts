import type { Adapter, Builder } from "@sveltejs/kit";
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
    name: "sveltekit-on-lambda",
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

      const pkg = JSON.parse(readFileSync("package.json", "utf8"));

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
        external: [
          // dependencies could have deep exports, so we need a regex
          ...Object.keys(pkg.dependencies || {}).map((d) =>
            new RegExp(`^${d}(\\/.*)?$`).toString(),
          ),
        ],
        target: "es2022",
        bundle: true,
        platform: "node",
        outdir: `${out}/server`,
        minify: options.buildOptions?.minify ?? true,
        splitting: true,
        treeShaking: true,
        sourcemap: sourcemap === "none" ? undefined : sourcemap,
      });

      builder.copy(`${files}/node`, `${out}/server`, {
        replace: {
          MANIFEST: "./manifest.js",
          SERVER: "./index.js",
        },
      });

      if (builder.hasServerInstrumentationFile?.()) {
        builder.instrument?.({
          entrypoint: `${out}/index.js`,
          instrumentation: `${out}/server/instrumentation.server.js`,
          module: {
            exports: ["path", "host", "port", "server"],
          },
        });
      }

      const routes = [
        ...new Set(
          [...clientFiles, ...prerenderedFiles]
            .map((x) => {
              const z = dirname(x);
              if (z === ".") return x;
              if (z.includes("/")) return undefined;
              return `${z}/*`;
            })
            .filter(Boolean),
        ),
      ];

      writeFileSync(join(out, "routes.json"), JSON.stringify(routes));
    },

    supports: {
      read: () => true,
      instrumentation: () => true,
    },
  };
};
