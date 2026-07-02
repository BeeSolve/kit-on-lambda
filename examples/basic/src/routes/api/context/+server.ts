import { getAwsEvent } from "@beesolve/lambda-fetch-api";
import { json } from "@sveltejs/kit";

export function GET() {
  const event = getAwsEvent();
  return json(event);
}
