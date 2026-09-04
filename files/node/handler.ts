import process from "node:process";

import {
  awsRequest,
  awsResponseBody,
  awsResponseHeaders,
  isAPIGatewayProxyEvent,
  runWithAwsContext,
} from "@beesolve/lambda-fetch-api";
import { createReadableStream } from "@sveltejs/kit/node";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  Context as LambdaContext,
} from "aws-lambda";
import { manifest } from "MANIFEST";
import { Server } from "SERVER";

type Context = Omit<LambdaContext, "done" | "succeed" | "fail">;

const server = new Server(manifest);

await server.init({
  env: definedEnv(process.env),
  read: createReadableStream,
});

function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(env)) {
    if (value != null) entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

export async function handler(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResult | APIGatewayProxyResultV2> {
  const request = awsRequest(event);

  return runWithAwsContext(event, context, async () => {
    const response = await server.respond(request, {
      getClientAddress() {
        return request.headers.get("x-forwarded-for") ?? "";
      },
    });

    return {
      statusCode: response.status,
      ...awsResponseHeaders(response, isAPIGatewayProxyEvent(event) ? "v1" : "v2"),
      ...(await awsResponseBody(response)),
    };
  });
}
