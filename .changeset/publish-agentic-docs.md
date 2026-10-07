---
"kit-on-lambda": patch
---

Publish agent-readable documentation inside the package tarball.

The package now ships a `DOCS.md` index at its root and how-to guides under
`docs/how-to/`, so AI agents can read usage directly from `node_modules`. The `files`
allowlist was extended to include `DOCS.md` and `docs/how-to`; ADRs and the IAM policy
sample remain unpublished. No runtime code changed.
