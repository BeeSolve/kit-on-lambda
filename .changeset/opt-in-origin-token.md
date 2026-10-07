---
"kit-on-lambda": patch
---

Bump @beesolve/lambda-function-url-protection to ^0.2.0, whose origin-token enforcement is now opt-in by the `ORIGIN_TOKEN` environment variable. This fixes the API Gateway origin configuration, where the handler is deployed without `ORIGIN_TOKEN` and must pass requests through rather than reject them with a 403.
