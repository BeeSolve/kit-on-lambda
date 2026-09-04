---
"kit-on-lambda": patch
---

Document `paths.relative: false` as the recommended way to configure asset paths, so the CloudFront distribution URL is no longer required at build time.

The `SvelteKit` construct already routes root-absolute asset paths (`/_app/*`, top-level static files) to S3 via per-directory CloudFront behaviors, so emitting root-absolute URLs is sufficient and avoids the first-deploy chicken-and-egg problem of needing the distribution URL before it exists.

- Add an "Asset paths — `paths.relative` vs `paths.assets`" section explaining both approaches and their trade-offs.
- Present `paths.assets` (absolute CloudFront URL) as an optional alternative for cross-origin/separate-domain asset serving, rather than a requirement.
- Update the Option 1/2/3 `svelte.config.js` examples to use `paths: { relative: false }`.
- Add a troubleshooting entry for missing styles/scripts on nested routes (assets 404).
