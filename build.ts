import { build } from "bun";
import { dts } from "bun-dts";
import { cp, rm } from "node:fs/promises";

const outdir = "dist";

console.time("remove outdir");
await rm(outdir, { recursive: true, force: true });
console.timeEnd("remove outdir");

console.time("build");
await Promise.all([
  build({
    entrypoints: ["bun.ts", "esb.ts"],
    external: ["esbuild", "@beesolve/lambda-fetch-api"],
    target: "node",
    minify: false,
    sourcemap: "linked",
    outdir,
    plugins: [dts()],
  }),
  cp("files", `${outdir}/files`, { recursive: true }),
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
