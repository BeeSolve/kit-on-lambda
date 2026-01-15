import * as Bun from "bun";
import dts from "bun-plugin-dts";
import { rmSync } from "node:fs";

console.time("Built.");

rmSync("dist", { force: true, recursive: true });

await Bun.build({
  entrypoints: ["cdk.ts"],
  outdir: "dist",
  target: "node",
  minify: true,
  splitting: true,
  sourcemap: "linked",
  external: ["aws-cdk", "aws-cdk-lib", "constructs"],
  plugins: [dts()],
});

console.timeEnd("Built.");
