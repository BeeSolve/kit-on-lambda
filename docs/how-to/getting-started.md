# How to: Deploy a SvelteKit app to Lambda

> Full working example: https://github.com/BeeSolve/kit-on-lambda/tree/main/examples/basic

`kit-on-lambda` has two parts: a SvelteKit **adapter** that produces a Lambda-ready
build, and a **CDK construct** (`SvelteKit`) that deploys that build behind CloudFront.

## Prerequisites

- A SvelteKit app
- An AWS CDK app (`aws-cdk-lib` v2); `aws-cdk-lib` and `constructs` are peer dependencies

## Steps

### 1. Install

```sh
npm i kit-on-lambda aws-cdk aws-cdk-lib constructs
```

(or `bun i kit-on-lambda aws-cdk aws-cdk-lib constructs`)

### 2. Wire the adapter into `vite.config.ts`

The default export is the esbuild/Node adapter. Pass `out` to control the build output
directory.

```ts
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const adapter = (await import("kit-on-lambda")).default({ out: "build" });

export default defineConfig(async () => ({
  plugins: [await sveltekit({ adapter })],
}));
```

For the Bun runtime, import `kit-on-lambda/bun` instead. Build your app with
`vite build` (or `bun run build`) to produce the output directory.

### 3. Deploy with the `SvelteKit` construct

Point `buildDirectory` at the adapter output and pick the runtime. The construct
provisions the Lambda, CloudFront distribution, and S3 asset bucket.

```ts
import { SvelteKit } from "kit-on-lambda/cdk";

const sk = new SvelteKit(this, "App", {
  buildDirectory: join(__dirname, "../build"),
  runtime: "node",
});
```

`sk.distribution` and `sk.handler` are exposed for outputs or further wiring.

## Common Pitfalls

- **Runtime must match the adapter.** Use the default/esbuild adapter with
  `runtime: "node"`, and `kit-on-lambda/bun` with `runtime: "bun"` (or `"node"` for the
  Bun-built-on-Node option). See the README's three options for the full matrix.
- **The adapter only affects build/deploy.** Local `vite dev` runs with no Lambda,
  CloudFront, or S3.
- **Named form actions.** SvelteKit `?/action` query parameters can be misrouted behind
  CloudFront - see the README troubleshooting section.

## See Also

- [Custom Origins](./custom-origins.md)
- [Full example on GitHub](https://github.com/BeeSolve/kit-on-lambda/tree/main/examples/infra)
