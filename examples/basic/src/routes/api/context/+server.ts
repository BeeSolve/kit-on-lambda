import { getAwsEvent } from "@beesolve/lambda-fetch-api";

export function GET() {
  const event = getAwsEvent();
  return Response.json(event);
}
