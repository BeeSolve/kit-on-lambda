---
"kit-on-lambda": patch
---

Fix CloudFront routing and prerendered asset deployment.

- `computeRoutes` no longer emits a greedy one-segment wildcard (e.g. `_app/*`).
  SvelteKit serves dynamic endpoints under `_app/` too — notably remote
  functions at `_app/remote/*` — and the broad `_app/*` S3 route shadowed them,
  sending those dynamic requests to the asset bucket (404/403) instead of the
  Lambda default behaviour. Routes nested two or more levels deep now collapse
  to a two-segment wildcard (`_app/immutable/*`) and one-level files stay exact
  (`_app/version.json`), so dynamic `_app/*` paths fall through to the Lambda.
- The S3 `BucketDeployment` now also uploads the `prerendered/` build output
  (guarded so synth does not fail when no route is prerendered). Prerendered
  routes were already registered from `routes.json` but their files were never
  uploaded, so prerendered pages 404'd.
