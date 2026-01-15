# SvelteKit adapter for Bun on Lambda

This adapter bundles your SvelteKit so it could be run on Lambda with Bun.

The adapter also exposes CDK construct which helps you to deploy your SvelteKit application.

## Usage

In this section you will be walked through steps to use SvelteKit adapter and deploy it to AWS Lambda with Bun runtime.

### Installation

```bash
bun i @beesolve/lambda-bun-sveltekit-adapter aws-cdk aws-cdk-lib constructs
```

### `svelte.config.js` setup

```js
import adapter from '@beesolve/lambda-bun-sveltekit-adapter';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const originUrl = 'https://{distributionId}.cloudfront.net'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter(),
    paths: {
      assets: originUrl,
    },
    csrf: {
      trustedOrigins: [originUrl],
    },
  },
};

export default config;
```

> [!NOTE]
> It is important to set `origin` to `kit.paths.assets` and `kit.csrf.trustedOrigins`.

### CDK deployment

Below you can see the minimum CDK configuraiton which will deploy your SvelteKit application to AWS Lambda behind CloudFront. You can pass various options to `SvelteKit` construct.

```ts
// app.ts
import { SvelteKit } from '@beesolve/lambda-bun-sveltekit-adapter/cdk';
import { App, Stack, type Environment } from 'aws-cdk-lib';

const env: Environment = {
  account: 'your-account-id',
  region: 'your-prefered-region',
};

const app = new App();
const stack = new Stack(app, 'YourSite', { env });

const { handler, distribution } = new SvelteKit(stack, 'SvelteKit');

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

Once you have changed your `package.json` you will be able to build your SvelteKit application and deploy it to AWS:

```bash
bun run build
bun run cdk bootstrap # only needed for the first time
bun run cdk deploy
```
