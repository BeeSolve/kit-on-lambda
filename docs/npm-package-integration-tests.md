# Publishing an npm Package with Integration Tests (Bun + GitHub Actions + AWS)

A pattern for repos where the root is the published package and you need integration tests that deploy real infrastructure against the local source.

---

## The problem with local deps

Integration tests typically live alongside the package and need to import it. The naive approach — `"my-package": "file:../.."` — has two fatal flaws with Bun:

1. **Infinite install loop.** When Bun resolves a `file:` dep it copies/traverses the entire target directory. If that directory contains nested `package.json` files (e.g. `examples/`), Bun recurses into each, which then point back at `file:../..`, looping forever. `bun install` never completes.

2. **`dist/` is absent at build time.** Even when the lockfile is frozen and the install succeeds, Bun copies the directory *at install time*. In CI the package is typically built after deps are installed, so `dist/` does not exist yet when the copy is made. When the integration test later tries to import the adapter (e.g. during `vite build`), it finds an empty package with no exports and the build fails.

**The fix: Bun workspaces (preferred) or `link:` (if the package is the repo root).**

---

## Recommended repo structure

The cleanest layout puts the published package under `packages/` so it is a workspace *member* rather than the workspace *root*. With this structure `workspace:*` resolution works correctly and there is one lockfile for the entire repo.

```
my-repo/
├── package.json          # private workspace root
├── bun.lock              # single unified lockfile
├── packages/
│   └── my-package/       # the npm package you publish
│       ├── package.json  # name: "my-package", no "private" field
│       ├── src/
│       └── dist/
└── examples/
    ├── basic/
    │   └── package.json  # "my-package": "workspace:*"
    └── infra/            # CDK / infrastructure
        └── package.json  # "my-package": "workspace:*"
```

**Workspace root `package.json`:**

```json
{
  "name": "my-repo-root",
  "private": true,
  "workspaces": [
    "packages/my-package",
    "examples/basic",
    "examples/infra"
  ]
}
```

**Example `package.json`:**

```json
{
  "name": "my-basic-example",
  "private": true,
  "dependencies": {
    "my-package": "workspace:*"
  }
}
```

One `bun install` at the repo root installs everything. In CI, one `bun install --frozen-lockfile` is enough.

---

## Workaround when the package IS the repo root

If restructuring to `packages/` is not an option, use **name-based `link:`** combined with `bun link`.

### Why path-based `link:../..` does NOT work

`"my-package": "link:../.."` looks like it should create a symlink to `../..`, but in Bun it creates `node_modules/my-package → ~/.bun/install` (Bun's global cache *directory*, not your package). Node.js-based tools (Vite, CDK, tsc) cannot resolve the package through this malformed symlink.

### The correct approach: name-based `link:`

**Step 1 — register the package globally once (or in CI):**

```bash
# Run at the repo root — registers it in ~/.bun/install/global/node_modules/<name> -> /absolute/path
bun link
```

**Step 2 — reference by name in each example `package.json`:**

```json
{
  "dependencies": {
    "my-package": "link:my-package"
  }
}
```

Bun now creates `node_modules/my-package → ../../../` (a proper relative symlink to the repo root) — resolvable by Node.js, Vite, CDK, and any other tool.

This solves both `file:` problems:

- No infinite loop — Bun creates a symlink instead of copying the directory.
- No stale `dist/` — the symlink always points at the live root, so `dist/` is present as soon as the build step runs.

**Trade-off:** each example maintains its own `bun.lock`, but regenerating it is instant and loop-free:

```bash
bun link                           # register globally (one-time per machine)
bun install --cwd examples/infra   # regenerate lockfile
```

---

## GitHub Actions workflow

### Principles

- **Always pin to the latest major version tag** (`@v4`, not `@v4.1.2`). Major tags roll forward with safe patches automatically.
- **Use Dependabot to track major version bumps** — add `.github/dependabot.yml` (see below).
- **Use OIDC for AWS access** — no long-lived credentials in secrets.
- **Set `cancel-in-progress: false`** for integration tests so a deploy is never orphaned mid-run.

### Workflow (workspaces approach — single install)

```yaml
name: Integration Tests

on:
  workflow_call:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'packages/**'
      - 'examples/**'
      - 'test/integration/**'

concurrency:
  group: integ-${{ github.ref }}
  cancel-in-progress: false

jobs:
  integ:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      id-token: write   # required for OIDC token
      contents: read
    env:
      AWS_REGION: eu-central-1
      CI: true
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_INTEG_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build package
        run: bun run build --filter my-package   # or your build script

      - name: Run integration tests
        run: bun run integ:deploy-test-destroy

      - name: Cleanup (always)
        if: always()
        run: bun run integ:cleanup
```

### Workflow (link: approach — separate installs)

Install order matters: root first (creates `node_modules/` that linked examples resolve transitive deps through), then register the package globally with `bun link`, then install examples, then build. Because `link:` is a live symlink, `dist/` will be present for the test runner even though it's built after the installs.

```yaml
      - name: Install root dependencies
        run: bun install --frozen-lockfile

      - name: Register local package globally
        run: bun link

      - name: Install example dependencies
        run: |
          bun install --frozen-lockfile --cwd examples/basic
          bun install --frozen-lockfile --cwd examples/streaming
          bun install --frozen-lockfile --cwd examples/infra

      - name: Build package
        run: bun run prepublishOnly   # creates dist/ that examples resolve through the symlink

      - name: Run integration tests
        run: bun run integ:deploy-test-destroy

      - name: Cleanup (always)
        if: always()
        run: bun run integ:cleanup
```

### Keep action versions current

Add `.github/dependabot.yml` to get automated PRs when a new major version of an action is released:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      actions:
        patterns: ['*']
```

---

## AWS OIDC setup

OIDC lets GitHub Actions assume an IAM role without storing AWS credentials as secrets. The setup is one-time per AWS account.

### 1. Create the OIDC provider (one-time per account)

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  2>/dev/null || echo "already exists"
```

### 2. Create the IAM role

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO="MyOrg/my-repo"   # replace with your GitHub org/repo

aws iam create-role \
  --role-name my-repo-integ \
  --assume-role-policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Effect\": \"Allow\",
        \"Principal\": {
          \"Federated\": \"arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com\"
        },
        \"Action\": \"sts:AssumeRoleWithWebIdentity\",
        \"Condition\": {
          \"StringEquals\": {
            \"token.actions.githubusercontent.com:aud\": \"sts.amazonaws.com\"
          },
          \"StringLike\": {
            \"token.actions.githubusercontent.com:sub\": \"repo:${REPO}:*\"
          }
        }
      },
      {
        \"Effect\": \"Allow\",
        \"Principal\": { \"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\" },
        \"Action\": \"sts:AssumeRole\"
      }
    ]
  }"
```

The second statement allows local runs via `aws sts assume-role` using your personal credentials.

### 3. Attach permissions

Attach whatever IAM policy your integration tests need (CloudFormation, Lambda, S3, CloudFront, etc.) to the role, then store the ARN as a repo secret:

```bash
gh secret set AWS_INTEG_ROLE_ARN \
  --body "arn:aws:iam::${ACCOUNT_ID}:role/my-repo-integ"
```

### 4. Local runs

```bash
# Assume the role locally using your default credentials
export AWS_PROFILE=my-repo-integ   # configured to assume the role

# or inline:
eval $(aws sts assume-role \
  --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/my-repo-integ" \
  --role-session-name local \
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
  --output text | awk '{print "export AWS_ACCESS_KEY_ID="$1"\nexport AWS_SECRET_ACCESS_KEY="$2"\nexport AWS_SESSION_TOKEN="$3}')

bun run integ:deploy-test-destroy
```

---

## Preventing orphaned stacks

Integration tests that crash mid-run leave CloudFormation stacks running and incurring cost. Two safeguards:

**1. `if: always()` cleanup step in the workflow** (shown above) — runs even if tests fail.

**2. A cleanup script** for stacks left by interrupted local runs or CI jobs that were force-cancelled:

```bash
#!/usr/bin/env bash
# scripts/integ-cleanup.sh
set -euo pipefail
PREFIX="MyRepoInteg-"
stacks=$(aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ROLLBACK_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, '${PREFIX}')].StackName" \
  --output text)
for stack in $stacks; do
  echo "Destroying $stack"
  aws cloudformation delete-stack --stack-name "$stack"
  aws cloudformation wait stack-delete-complete --stack-name "$stack"
done
```

Add to `package.json`:

```json
{
  "scripts": {
    "integ:deploy-test-destroy": "RUN_AWS_INTEG=1 bun test test/integration/deploy-destroy.test.ts",
    "integ:cleanup": "bash scripts/integ-cleanup.sh"
  }
}
```

---

## Lockfile hygiene

| Scenario | Command |
|---|---|
| First time setup | `bun install` at repo root |
| After adding a dep to any workspace member | `bun install` at repo root |
| Regenerate a `link:`-based example lockfile | `bun install --cwd examples/infra` |
| CI | `bun install --frozen-lockfile` |

Never commit `examples/*/outputs.json` — those are generated by CDK deploy and contain ephemeral CloudFront URLs tied to a specific test run timestamp.
