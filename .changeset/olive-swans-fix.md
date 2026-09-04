---
"kit-on-lambda": patch
---

Align `aws-cdk-lib` and `constructs` version ranges in the `overrides` block with the bumped `peerDependencies` (both to the 2.268 / 10.8 line). Previously the stale override ranges conflicted with the direct dependency, causing `npm publish` to fail with `EOVERRIDE`.
