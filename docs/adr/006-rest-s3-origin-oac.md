# ADR 006: Serve Static Assets via a REST S3 Origin with Origin Access Control

## Status

Accepted

## Context

The `SvelteKit` construct provisions an S3 bucket for the adapter's static assets
(the `/_app/*` immutable bundles, favicon, and other client files listed in
`routes.json`) and adds a CloudFront behavior per route pointing at that bucket.

Originally the bucket was configured as an **S3 website endpoint**
(`websiteIndexDocument: "index.html"`), fronted by an `HttpOrigin` targeting
`bucket.bucketWebsiteDomainName` over HTTP, with a public `s3:GetObject` bucket
policy so CloudFront could read it.

This has a subtle but damaging failure mode. On an S3 **website** endpoint, a
request for a missing key does not return a clean `404`. It returns the configured
error/index document — an **HTML** body with `Content-Type: text/html`, often with a
`200` or `404` status. So when a browser requests a hashed asset that is absent —
for example `/_app/immutable/nodes/5.<hash>.js` after a deploy where the SSR HTML
references new hashes but the bucket (or the cache in front of it) still has the old
set — it receives HTML instead of JavaScript. The browser then tries to parse that
HTML as an ES module and throws:

```
Unhandled Promise Rejection: TypeError: Importing a module script failed
```

The visible effect is that pages render with missing styling and broken interactivity,
with no clear indication of the real cause. A version skew or a partial asset upload —
transient, recoverable conditions — is turned into a confusing, silent breakage rather
than an honest, debuggable error.

## Decision

Serve the assets from a **REST S3 origin with Origin Access Control (OAC)** using
`S3BucketOrigin.withOriginAccessControl(bucket)`, and make the bucket fully private:

- Remove `websiteIndexDocument` (no website endpoint).
- Set `blockPublicAccess: BlockPublicAccess.BLOCK_ALL` and `enforceSSL: true`.
- Remove the public `s3:GetObject` resource policy — OAC installs a bucket policy
  scoped to the CloudFront distribution automatically.

CORS is retained on the bucket. All CloudFront behaviors (default SSR plus each route)
are otherwise unchanged.

## Rationale

### 1. Missing assets fail cleanly

A REST S3 origin returns real HTTP status codes. A missing object 404s with no body,
so the browser never receives HTML in place of a module. Version skew and partial
uploads surface as ordinary `404`s in the network panel instead of a cryptic module
import rejection — the failure becomes obvious and debuggable, and often stops
manifesting as broken rendering at all.

### 2. Correct Content-Type

The REST origin passes through the object's stored metadata, so `.js` is served as
`text/javascript` and `.css` as `text/css`. Strict browsers accept modules served with
the correct type. The website endpoint's HTML fallback bypassed this entirely.

### 3. The bucket is private

OAC lets CloudFront sign origin requests (SigV4), so the bucket needs no public-read
policy and can block all public access. This is a security improvement over the
public-read website bucket, and it is AWS's recommended pattern for S3-backed
CloudFront distributions (OAI is legacy).

## Consequences

- **Infrastructure change on redeploy.** Existing deployments lose the bucket's website
  configuration and public-read policy; a CloudFront `OriginAccessControl` resource and
  an OAC-scoped bucket policy are added. This is a resource update, not a data change —
  the bucket and its objects are retained.
- **No public URL for the bucket.** Assets are reachable only through CloudFront. Any
  consumer that relied on the raw website URL (there is no supported use of this) would
  break.
- **No API surface change.** The `SvelteKit` construct's props and public properties are
  unchanged; the fix is entirely internal to how the origin is built.
- The change is covered by unit assertions (private bucket, no website configuration,
  presence of an `OriginAccessControl` with `s3` / `sigv4` / `always` signing).

## Alternatives Considered

### Keep the website origin, invalidate `/_app/*` on every deploy

Reduces the window for stale-asset skew but does not fix the root fault: a genuinely
missing object still returns HTML and still poisons module imports. Invalidation is a
mitigation for one cause (cache skew), not for the class of problem. Rejected as
insufficient on its own.

### Set an explicit error document that is not HTML

An S3 website endpoint still responds with `Content-Type: text/html` for its error
document and cannot return a bare `404` with no body. There is no website-endpoint
configuration that yields a clean, typed `404`. Rejected.

### Leave it to consumers to override the `/_app/*` behavior

Consumers could re-add the behavior against an OAC origin in their own stack, but that
pushes non-obvious, security-relevant plumbing onto every consumer and leaves the
default fragile. The construct should provide a correct default. Rejected.

## References

- Downstream investigation that surfaced this:
  `@beesolve/dmarc-dashboard` `docs/bugs/002-cloudfront-module-import-failed.md`.
- `S3BucketOrigin.withOriginAccessControl` — aws-cdk-lib `aws-cloudfront-origins`.
