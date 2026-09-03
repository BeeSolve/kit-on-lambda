---
"kit-on-lambda": minor
---

Serve static assets from a REST S3 origin with Origin Access Control (OAC) instead of an S3 website origin.

The website endpoint returned an HTML error/index document for missing objects, so a missing hashed asset (e.g. during a version skew or partial upload) came back as `text/html`. Browsers then tried to parse that HTML as an ES module and threw "Importing a module script failed", producing silent styling breakage instead of a clear error. A REST S3 origin via OAC returns real HTTP status codes and the object's stored Content-Type, so a missing asset 404s cleanly and never poisons module imports. The assets bucket is now fully private (all public access blocked, no public bucket policy, no website configuration); CloudFront signs origin requests via OAC.

This changes the provisioned infrastructure: on redeploy the assets bucket loses its website configuration and public-read policy, and a CloudFront Origin Access Control resource plus an OAC-scoped bucket policy are added. No API changes.
