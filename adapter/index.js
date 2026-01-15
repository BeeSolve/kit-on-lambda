import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @template T
 * @template {keyof T} K
 * @typedef {Partial<Omit<T, K>> & Required<Pick<T, K>>} PartialExcept
 */

/**
 * We use a custom `Builder` type here to support the minimum version of SvelteKit.
 * @typedef {PartialExcept<import('@sveltejs/kit').Builder, 'log' | 'rimraf' | 'mkdirp' | 'config' | 'prerendered' | 'routes' | 'createEntries' | 'findServerAssets' | 'generateFallback' | 'generateEnvModule' | 'generateManifest' | 'getBuildDirectory' | 'getClientDirectory' | 'getServerDirectory' | 'getAppPath' | 'writeClient' | 'writePrerendered' | 'writePrerendered' | 'writeServer' | 'copy' | 'compress'>} Builder2_4_0
 */

const files = fileURLToPath(new URL("./files", import.meta.url).href);

/** @type {import('./index.js').default} */
export default function (opts = {}) {
  const { out = "build", precompress = true, buildOptions = {} } = options;

  return {
    name: "sveltekit-adapter-bun-lambda",
    /** @param {Builder2_4_0} builder */
    async adapt(builder) {
      const tmp = builder.getBuildDirectory("adapter-bun-lambda");

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

      /** @type {Record<string, string>} */
      const input = {
        index: `${tmp}/index.js`,
        manifest: `${tmp}/manifest.js`,
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
        target: "bun",
        outdir: `${out}/server`,
        minify: true,
        sourcemap: "linked",
        splitting: true,
        ...buildOptions,
      });

      if (!result.success) {
        console.error("Build failed:", result.logs);
        process.exit(1);
      }

      builder.copy(files, `${out}/server`, {
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
}
