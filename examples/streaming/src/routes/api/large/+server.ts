export function GET() {
  // ~10 MB payload — exceeds the 6 MB API Gateway buffered response limit.
  // This verifies that streaming mode handles large responses without truncation.
  const chunk = "x".repeat(1024);
  const chunks = Array.from({ length: 10 * 1024 }, () => chunk);
  const body = chunks.join("");
  return new Response(body, {
    headers: { "content-type": "text/plain" },
  });
}
