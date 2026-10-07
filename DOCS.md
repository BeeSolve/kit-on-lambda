# kit-on-lambda - Documentation

**Keywords:** sveltekit, adapter, aws lambda, cloudfront, s3, cdk construct, SvelteKit, node runtime, bun runtime, response streaming, function url, toDefaultOrigin, basicHttpAuthentication, lambda warmer, getAwsEvent, getAwsContext

> This documentation is published inside the installed package and matches the installed version. Prefer it over prior knowledge or older examples found online.

> Full source and examples: https://github.com/BeeSolve/kit-on-lambda/tree/main

`kit-on-lambda` is a SvelteKit adapter plus a CDK construct that deploys a SvelteKit app
to AWS Lambda (Node.js or Bun runtime) behind CloudFront, with static assets on S3. The
package exposes three entry points: the default esbuild/Node adapter, `kit-on-lambda/bun`
(the Bun adapter), and `kit-on-lambda/cdk` (the `SvelteKit` construct).

## How-To Guides

| Guide                                               | Description                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Getting Started](./docs/how-to/getting-started.md) | Wire the adapter into `vite.config.ts` and deploy with the `SvelteKit` CDK construct |
| [Custom Origins](./docs/how-to/custom-origins.md)   | Override the default CloudFront origin via `toDefaultOrigin` (e.g. HTTP API Gateway) |

## Working Examples

The [examples/](https://github.com/BeeSolve/kit-on-lambda/tree/main/examples) directory
contains runnable SvelteKit apps and deployable CDK stacks:

| Example                                                                                              | What it shows                                                                  |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [examples/basic](https://github.com/BeeSolve/kit-on-lambda/tree/main/examples/basic)                 | Minimal SvelteKit app built for all three adapter/runtime options              |
| [examples/streaming](https://github.com/BeeSolve/kit-on-lambda/tree/main/examples/streaming)         | Response streaming on the Bun runtime                                          |
| [examples/observability](https://github.com/BeeSolve/kit-on-lambda/tree/main/examples/observability) | OpenTelemetry tracing                                                          |
| [examples/infra](https://github.com/BeeSolve/kit-on-lambda/tree/main/examples/infra)                 | CDK stacks wiring the `SvelteKit` construct for each build/runtime combination |

## Further Reading

- [README](./README.md) - the three build/run options, local development, asset paths, custom origins, observability, and troubleshooting
- [CHANGELOG](./CHANGELOG.md) - version history
- [Architecture Decision Records](https://github.com/BeeSolve/kit-on-lambda/tree/main/docs/adr) (GitHub only)
