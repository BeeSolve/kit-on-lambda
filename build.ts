import { build } from "bun";
import { dts } from "bun-dts";
import { rm } from "node:fs/promises";

const outdir = "dist";

console.time("remove outdir");
await rm(outdir, { recursive: true, force: true });
console.timeEnd("remove outdir");

console.time("build");
await Promise.all([
  build({
    entrypoints: ["bun.ts", "esb.ts", "runtime.ts"],
    external: ["esbuild"],
    target: "node",
    minify: false,
    sourcemap: "linked",
    outdir,
    plugins: [dts()],
  }),
  build({
    entrypoints: [
      "files/node/handler.ts",
      "files/node/stream.ts",
      "files/bun/handler.ts",
      "files/bun/stream.ts",
    ],
    external: ["SERVER", "MANIFEST"],
    target: "node",
    minify: false,
    sourcemap: "none",
    outdir: `${outdir}/files`,
  }),
  build({
    entrypoints: ["cdk.ts"],
    external: ["aws-cdk", "aws-cdk-lib", "constructs"],
    target: "node",
    minify: false,
    sourcemap: "linked",
    outdir,
    plugins: [dts()],
  }),
]);
console.timeEnd("build");
