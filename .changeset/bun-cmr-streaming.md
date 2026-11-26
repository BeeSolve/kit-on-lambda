---
"kit-on-lambda": major
---

Run the Bun runtime on the Lambda customer-managed runtime (CMR) and support response streaming with Bun.

- Upgrade `@beesolve/lambda-bun-runtime` to v4. The `SvelteKit` construct with `runtime: "bun"` now creates a `BunFunction` on the Bun CMR and no longer creates a `BunLambdaLayer`.
- Bun deployments with `InvokeMode.RESPONSE_STREAM` (the default) now stream responses via `asResponseStreamHandler`, protected by the Function URL origin token like the Node.js handler. Responses larger than 6 MB work.

Breaking changes:

- Peer dependency `aws-cdk-lib` raised to `^2.278.0` and `@sveltejs/kit` to `^3.4.1`.
- `lambdaProps` for `runtime: "bun"` no longer accepts `bunLayer`.
- The Bun runtime is published in `eu-north-1`, `eu-central-1`, `eu-west-1`, `us-east-1` and `us-west-2`, and the stack needs a concrete region. In other regions publish your own runtime and set `lambdaProps.bunRuntime: { runtimeArn, runtimeAlias }`.
- On the next deploy, existing Bun functions move from a layer on `provided.al2023` to the CMR, and Bun stacks using the default invoke mode switch from buffered to streamed responses.
