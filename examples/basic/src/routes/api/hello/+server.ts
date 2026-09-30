export function GET() {
  return Response.json({
    message: "hello from kit-on-lambda",
    timestamp: new Date().toISOString(),
  });
}
