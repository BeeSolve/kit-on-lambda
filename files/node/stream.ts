// adjusted code from nitro project
// @see https://github.com/nitrojs/nitro/blob/dfdff9e93d0fa16b48afe5d9f0c44a87b4b5d249/src/presets/aws-lambda/runtime/aws-lambda-streaming.ts
import { createReadableStream } from "@sveltejs/kit/node";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { manifest } from "MANIFEST";
import process from "node:process";
import type { Readable } from "node:stream";
import { Server } from "SERVER";
import { awsRequest, awsResponseHeaders } from "./util.js";

const server = new Server(manifest);
await server.init({
  env: process.env as Record<string, string>,
  read: createReadableStream,
});

export const handler = awslambda.streamifyResponse(
  async (event: APIGatewayProxyEventV2, responseStream, context) => {
    const request = awsRequest(event, context);

    const response = await server.respond(request, {
      getClientAddress() {
        return request.headers.get("x-forwarded-for") ?? "";
      },
    });

    const httpResponseMetadata = {
      statusCode: response.status,
      ...awsResponseHeaders(response, "v2"),
    };

    if (!httpResponseMetadata.headers!["transfer-encoding"]) {
      httpResponseMetadata.headers!["transfer-encoding"] = "chunked";
    }

    const body =
      response.body ??
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue("");
          controller.close();
        },
      });

    // Assign to the responseStream parameter to prevent accidental reuse of the non-wrapped stream.
    // @see https://docs.aws.amazon.com/lambda/latest/dg/response-streaming-tutorial.html
    responseStream = awslambda.HttpResponseStream.from(
      responseStream,
      httpResponseMetadata,
    );

    // Call write on the stream to trigger metadata to be sent
    // https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/2ce88619fd176a5823bc5f38c5484d1cbdf95717/src/HttpResponseStream.js#L22
    // @see https://github.com/Data-Only-Greater/sveltekit-adapter-aws-base/blob/b61777077ac4d306ccf96727a94c252dd37ef500/lambda/serverless_streaming.js#L74
    responseStream.write("");

    const reader = body.getReader();
    await streamToNodeStream(reader, responseStream);
  },
);

async function streamToNodeStream(
  reader: Readable | ReadableStreamDefaultReader,
  writer: NodeJS.WritableStream,
) {
  let readResult = await reader.read();
  while (!readResult.done) {
    writer.write(readResult.value);
    readResult = await reader.read();
  }
  writer.end();
}
