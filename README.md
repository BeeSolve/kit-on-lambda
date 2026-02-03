# kit-on-lambda

Adapter for running SvelteKit on AWS Lambda.

Adapter supports by default deployment to `Node.js` runtime bundled with `esbuild`.

Additionally when you are fan of `Bun`, you can use options of deployment to `Node.js` or even `Bun` runtimes bundled with `Bun`.

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


After you set up your `SvelteKit` you can deploy it with provided CDK constructs. The `SvelteKit` is deployed to AWS Lambda behind CloudFront and uses S3 bucket for static assets and caches.

![AWS architecture](./architecture.png)

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

The above code is recommended to be put to `app.ts` in the root of your repository. After that add following to your `packages.json`:

```json
{
  // ...
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "cdk": "cdk --app \"node --experimental-strip-types app.ts\" --profile {your-aws-profile}",
    // ...
  }
  // ...
}
```

<details>
    <summary>If you are using `bun` instead of `node`</summary>

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

</details>

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

By default the Lambda is deployed in `InvokeMode.RESPONSE_STREAM` invoke mode which means that the response will be streamed back to the client. If you wish to buffer the response you can change it in the options.

```ts
const { handler, distribution } = new SvelteKit(stack, 'SvelteKit', { 
  runtime: "node",
  invokeMode: InvokeMode.BUFFERED,
});
```

The response streaming is supported only for `node` runtime.

## 2. build with `Bun` run on `Bun` runtime

todo

## 3. build with `Bun` run on `Node.js` runtime

todo


# Thank you

This package has been inspired by various other libraries. I've adapted some of the code from following ones:

- [sveltekit-adapter-aws-base](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-base)
- [nitro aws-lambda preset](https://github.com/nitrojs/nitro/tree/main/src/presets/aws-lambda)
