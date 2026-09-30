export function GET() {
  return Response.json({
    message: "hello from kit-on-lambda streaming",
    timestamp: new Date().toISOString(),
  });
}
