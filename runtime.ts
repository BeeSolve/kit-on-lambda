export {
  isAPIGatewayProxyEvent,
  isAPIGatewayProxyEventV2,
  getAwsEvent,
  getAwsContext,
  getAwsV1Event,
  getAwsV2Event,
} from "@beesolve/lambda-fetch-api";

/** @deprecated Use getAwsEvent() from @beesolve/lambda-fetch-api */
export function toAwsEvent(_request: Request): never {
  throw new Error(
    "toAwsEvent is removed. Use getAwsEvent() from @beesolve/lambda-fetch-api instead.",
  );
}

/** @deprecated Use getAwsContext() from @beesolve/lambda-fetch-api */
export function toAwsContext(_request: Request): never {
  throw new Error(
    "toAwsContext is removed. Use getAwsContext() from @beesolve/lambda-fetch-api instead.",
  );
}
