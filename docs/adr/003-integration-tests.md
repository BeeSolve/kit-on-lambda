# ADR-003: Integration tests via real CDK-deployed AWS stacks

**Date:** 2025  
**Status:** Accepted

## Context

Unit tests cover individual handlers but cannot verify end-to-end behaviour: CloudFront routing, S3 static asset delivery, Lambda cold starts, cookie passthrough, or runtime-specific quirks. There are three distinct adapter/runtime combinations that need coverage:

| # | Bundler | Lambda runtime |
|---|---------|----------------|
| 1 `EsbNode` | esbuild | Node.js 24 |
| 2 `BunNode` | Bun | Node.js 24 |
| 3 `BunBun` | Bun | Bun (custom layer) |

## Decision

Deploy real CDK stacks on every CI run and tear them down afterwards. Stack names include a timestamp (`KitOnLambdaInteg-<Config>-<ts>`) to prevent collisions between concurrent runs.

`bun:test` orchestrates the full cycle: `beforeAll` builds all apps and runs `cdk deploy --all`; `afterAll` runs `cdk destroy --all`. An `if: always()` cleanup step in the workflow plus `scripts/integ-cleanup.sh` destroy any orphaned stacks left by interrupted runs.

Tests are gated behind `RUN_AWS_INTEG=1` so the file is importable without triggering deploys. The GitHub Actions workflow (`concurrency.cancel-in-progress: false`) ensures a deploy is never orphaned by a superseding push.

GitHub Actions authenticates to AWS via OIDC (`id-token: write` + `aws-actions/configure-aws-credentials`) — no long-lived credentials stored as secrets.

## Consequences

- Each CI run on `main` incurs real AWS costs and takes up to 30 minutes.
- `examples/infra/outputs.json` must not be committed — it contains ephemeral CloudFront URLs.
- Phase 2 test coverage (cache headers, precompressed assets, origin-token bypass, warm latency, Set-Cookie roundtrip, basic auth variant) is deferred until Phase 1 is stable.
