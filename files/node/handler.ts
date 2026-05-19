import { createReadableStream } from "@sveltejs/kit/node";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import {
  awsRequest,
  awsResponseBody,
  awsResponseHeaders,
  isAPIGatewayProxyEvent,
  runWithAwsContext,
} from "@beesolve/lambda-fetch-api";
import { manifest } from "MANIFEST";
import process from "node:process";
import { Server } from "SERVER";

const server = new Server(manifest);

await server.init({
  env: process.env as Record<string, string>,
  read: createReadableStream,
});

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
      ...awsResponseHeaders(
        response,
        isAPIGatewayProxyEvent(event) ? "v1" : "v2",
      ),
      ...(await awsResponseBody(response)),
    };
  });
}
