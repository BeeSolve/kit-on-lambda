import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { InvokeMode } from "aws-cdk-lib/aws-lambda";

import { SvelteKit } from "../cdk.js";

let buildDirectory: string;

beforeAll(() => {
  buildDirectory = mkdtempSync(join(tmpdir(), "kit-on-lambda-test-"));
  mkdirSync(join(buildDirectory, "server"), { recursive: true });
  mkdirSync(join(buildDirectory, "client"), { recursive: true });
  writeFileSync(join(buildDirectory, "routes.json"), JSON.stringify(["favicon.png", "_app/*"]));
  writeFileSync(join(buildDirectory, "server", "handler.js"), "export function handler() {}");
  writeFileSync(join(buildDirectory, "server", "stream.js"), "export function handler() {}");
  writeFileSync(join(buildDirectory, "client", "favicon.png"), "");
});

afterAll(() => {
  rmSync(buildDirectory, { recursive: true, force: true });
});

describe("SvelteKit with Function URL (default)", () => {
  it("creates a Lambda Function URL with RESPONSE_STREAM by default", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      buildDirectory,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Url", {
      AuthType: "NONE",
      InvokeMode: "RESPONSE_STREAM",
    });
  });

  it("creates a Lambda Function URL with BUFFERED when specified", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      invokeMode: InvokeMode.BUFFERED,
      buildDirectory,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Url", {
      AuthType: "NONE",
      InvokeMode: "BUFFERED",
    });
  });

  it("creates a Secrets Manager secret for origin token", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      buildDirectory,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      GenerateSecretString: {
        ExcludePunctuation: true,
        PasswordLength: 128,
      },
    });
  });

  it("creates a CloudFront distribution", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      buildDirectory,
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
  });

  it("creates an S3 bucket for static assets", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      buildDirectory,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::S3::Bucket", {
      WebsiteConfiguration: {
        IndexDocument: "index.html",
      },
    });
  });

  it("does not create an HTTP API Gateway", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      buildDirectory,
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::ApiGatewayV2::Api", 0);
  });

  it("uses the stream handler when invokeMode is RESPONSE_STREAM", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      invokeMode: InvokeMode.RESPONSE_STREAM,
      buildDirectory,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "stream.handler",
    });
  });

  it("uses the buffered handler when invokeMode is BUFFERED", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      invokeMode: InvokeMode.BUFFERED,
      buildDirectory,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "handler.handler",
    });
  });

  it("exposes distribution and handler properties", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    const site = new SvelteKit(stack, "Site", {
      runtime: "node",
      buildDirectory,
    });

    expect(site.distribution).toBeDefined();
    expect(site.handler).toBeDefined();
  });
});

describe("SvelteKit with toDefaultOrigin (HTTP API Gateway)", () => {
  it("uses the provided origin instead of Function URL", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    const api = new HttpApi(stack, "Api");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      invokeMode: InvokeMode.BUFFERED,
      buildDirectory,
      toDefaultOrigin: ({ handler }) => {
        const integration = new HttpLambdaIntegration("Integration", handler);
        api.addRoutes({ path: "/{proxy+}", methods: ["ANY" as never], integration });
        api.addRoutes({ path: "/", methods: ["ANY" as never], integration });

        return new HttpOrigin("example.execute-api.us-east-1.amazonaws.com");
      },
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
  });

  it("does not create a Function URL", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    const api = new HttpApi(stack, "Api");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      invokeMode: InvokeMode.BUFFERED,
      buildDirectory,
      toDefaultOrigin: ({ handler }) => {
        const integration = new HttpLambdaIntegration("Integration", handler);
        api.addRoutes({ path: "/{proxy+}", methods: ["ANY" as never], integration });
        return new HttpOrigin("example.execute-api.us-east-1.amazonaws.com");
      },
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::Lambda::Url", 0);
  });

  it("does not create an origin token secret", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    const api = new HttpApi(stack, "Api");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      invokeMode: InvokeMode.BUFFERED,
      buildDirectory,
      toDefaultOrigin: ({ handler }) => {
        const integration = new HttpLambdaIntegration("Integration", handler);
        api.addRoutes({ path: "/{proxy+}", methods: ["ANY" as never], integration });
        return new HttpOrigin("example.execute-api.us-east-1.amazonaws.com");
      },
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::SecretsManager::Secret", 0);
  });

  it("uses the buffered handler when invokeMode is BUFFERED", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    const api = new HttpApi(stack, "Api");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      invokeMode: InvokeMode.BUFFERED,
      buildDirectory,
      toDefaultOrigin: ({ handler }) => {
        const integration = new HttpLambdaIntegration("Integration", handler);
        api.addRoutes({ path: "/{proxy+}", methods: ["ANY" as never], integration });
        return new HttpOrigin("example.execute-api.us-east-1.amazonaws.com");
      },
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "handler.handler",
    });
  });

  it("creates a CloudFront distribution", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    const api = new HttpApi(stack, "Api");

    new SvelteKit(stack, "Site", {
      runtime: "node",
      invokeMode: InvokeMode.BUFFERED,
      buildDirectory,
      toDefaultOrigin: ({ handler }) => {
        const integration = new HttpLambdaIntegration("Integration", handler);
        api.addRoutes({ path: "/{proxy+}", methods: ["ANY" as never], integration });
        return new HttpOrigin("example.execute-api.us-east-1.amazonaws.com");
      },
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
  });

  it("exposes distribution and handler properties", () => {
    const app = new App();
    const stack = new Stack(app, "Test");

    const api = new HttpApi(stack, "Api");

    const site = new SvelteKit(stack, "Site", {
      runtime: "node",
      invokeMode: InvokeMode.BUFFERED,
      buildDirectory,
      toDefaultOrigin: ({ handler }) => {
        const integration = new HttpLambdaIntegration("Integration", handler);
        api.addRoutes({ path: "/{proxy+}", methods: ["ANY" as never], integration });
        return new HttpOrigin("example.execute-api.us-east-1.amazonaws.com");
      },
    });

    expect(site.distribution).toBeDefined();
    expect(site.handler).toBeDefined();
  });
});
