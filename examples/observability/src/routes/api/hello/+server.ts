export function GET() {
  return Response.json({
    message: "hello from a traced endpoint",
    timestamp: new Date().toISOString(),
  });
}
