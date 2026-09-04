import { cp, rm } from "node:fs/promises";

import { build } from "bun";

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
  }),
  cp("files", `${outdir}/files`, { recursive: true }),
  build({
    entrypoints: ["cdk.ts"],
    external: [
      "aws-cdk",
      "aws-cdk-lib",
      "constructs",
      "esbuild",
      "@beesolve/lambda-bun-runtime",
      "@beesolve/lambda-keep-active",
    ],
    target: "node",
    minify: false,
    sourcemap: "linked",
    outdir,
  }),
]);
console.timeEnd("build");

console.time("declarations");
const tsc = Bun.spawn(["tsc", "--project", "tsconfig.declarations.json"], {
  stdout: "inherit",
  stderr: "inherit",
});
const exitCode = await tsc.exited;
console.timeEnd("declarations");

if (exitCode !== 0) {
  process.exit(exitCode);
}
