---
"kit-on-lambda": patch
---

Upgrade `@beesolve/lint-config` to 0.3.0 and add the newly-required `oxlint-tsgolint` peer dependency, which enables type-aware linting. Prefix intentional fire-and-forget calls in the shipped handler/stream test templates with `void` to satisfy `no-floating-promises`.
