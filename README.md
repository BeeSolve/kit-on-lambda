# kit-on-lambda

Adapter for running SvelteKit on AWS Lambda.

Adapter supports by default deployment to `Node.js` runtime bundled with `esbuild`.
Additionally when you are fun of `Bun`, you can use options of deployment to `Node.js` or even `Bun` runtimes bundled with `Bun`.

## Installation

You can choose your favourite package manager to install the adapter and it's peer dependencies. There is an assumption that you've already set up `SvelteKit` in your repository.

```bash
npm i kit-on-lambda aws-cdk aws-cdk-lib constructs
# or
bun i kit-on-lambda aws-cdk aws-cdk-lib constructs
```

## Usage

There are 3 distinct options how you can use this adapter.

## 1. build with `esbuild` run on Node.js runtime

This is the default option. Here you can see how you can set up your SvelteKit so it could be deployed with CDK to official Node.js lambda runtime.

```ts
// svelte.config.js
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import adapter from "kit-on-lambda";

const originUrl = 'https://{distributionId}.cloudfront.net'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter(),
  },
  paths: {
    assets: originUrl,
  },
  csrf: {
    trustedOrigins: [originUrl],
  },
};

export default config;
```

> [!NOTE]
> It is important to set `origin` to `kit.paths.assets` and `kit.csrf.trustedOrigins`.


After you set up your `SvelteKit` you can deploy it with our CDK constructs. The `SvelteKit` is deployed to AWS Lambda behind CloudFront and uses S3 bucket for static assets and caches.

```ts
// app.ts
import { SvelteKit } from 'kit-on-lambda/cdk';
import { App, Stack, type Environment } from 'aws-cdk-lib';

const env: Environment = {
  account: 'your-account-id',
  region: 'your-prefered-region',
};

const app = new App();
const stack = new Stack(app, 'YourSite', { env });

const { handler, distribution } = new SvelteKit(stack, 'SvelteKit', { runtime: "node" });

// here you can add permissions to `handler` function etc
```

We recommend to put above code to `app.ts` in the root of your repository. Then we recommed to add following to your `packages.json`:

```json
{
  // ...
  "scripts": {
    "dev": "bun run --bun --env-file=./.env vite dev",
    "build": "bunx --bun vite build",
    "cdk": "cdk --app \"bun app.ts\" --profile {your-aws-profile}",
    // ...
  }
  // ...
}
```

Once you have changed your `package.json` you will be able to build your `SvelteKit` application and deploy it to AWS:

```bash
bun run build
bun run cdk bootstrap # only needed for the first time
bun run cdk deploy
```

Additionally in official Node.js lambda runtime you can use helpers which are provided by this package for getting AWS Event and Context objects like this:

```ts
// hooks.server.ts
import type { Handle } from "@sveltejs/kit";
import {
  isAPIGatewayProxyEvent,
  isAPIGatewayProxyEventV2,
  toAwsContext,
  toAwsEvent,
} from "kit-on-lambda/runtime";

export const handle: Handle = async ({ event, resolve }) => {
  const awsEvent = toAwsEvent(event.request);
  const awsContext = toAwsContext(event.request);

  isAPIGatewayProxyEvent(awsEvent);
  isAPIGatewayProxyEventV2(awsEvent);
  awsContext.getRemainingTimeInMillis();

  return await resolve(event);
};
```

## 2. build with `Bun` run on `Bun` runtime

todo

## 3. build with `Bun` run on `Node.js` runtime

todo
