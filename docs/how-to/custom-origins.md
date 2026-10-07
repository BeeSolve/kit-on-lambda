# How to: Use a custom CloudFront origin

> Full working example: https://github.com/BeeSolve/kit-on-lambda/tree/main/examples/infra

By default the `SvelteKit` construct serves dynamic requests from a Lambda Function URL
origin secured with a secret-based origin token. Override `toDefaultOrigin` to put the
SvelteKit handler behind a different origin - for example an HTTP API Gateway.

## When to use this

- You need API Gateway features (custom authorizers, usage plans, WAF association)
- You front the handler with a service that manages its own authorizer

## Steps

### 1. Provide `toDefaultOrigin`

The construct calls your factory with the SvelteKit `handler` and the selected
`invokeMode`, and expects a CloudFront origin back.

```ts
import { SvelteKit } from "kit-on-lambda/cdk";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";

new SvelteKit(this, "App", {
  buildDirectory: join(__dirname, "../build"),
  runtime: "node",
  toDefaultOrigin: ({ handler }) => {
    const api = new HttpApi(this, "Api", {
      defaultIntegration: new HttpLambdaIntegration("Int", handler),
    });
    const domain = `${api.apiId}.execute-api.${Stack.of(this).region}.amazonaws.com`;
    return new HttpOrigin(domain);
  },
});
```

## Common Pitfalls

- **`defaultBehavior` is managed internally.** You can override other distribution
  options via `distributionProps`, but not the default behavior - the construct owns it.
- **Response streaming vs API Gateway.** API Gateway does not support Lambda response
  streaming; set `invokeMode` to a buffered mode when fronting with API Gateway.

## See Also

- [Getting Started](./getting-started.md)
- [Full example on GitHub](https://github.com/BeeSolve/kit-on-lambda/tree/main/examples/infra)
