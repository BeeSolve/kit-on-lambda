# Integration Tests

## Context

`kit-on-lambda` ships three distinct adapter/runtime combinations. Unit tests cover individual handlers but cannot verify end-to-end behaviour: CloudFront routing, S3 static asset delivery, Lambda cold starts, cookie passthrough, or runtime-specific quirks. Integration tests deploy real stacks to AWS and exercise the full request path.

The design mirrors `@beesolve/lambda-bun-runtime`'s integration test approach: CDK-deployed stacks with timestamp-unique names, `bun:test` orchestrating deploy → test → teardown inside `beforeAll`/`afterAll`, and GitHub Actions OIDC for CI access.

---

## Phases

### Phase 1 — Core setup (this document)
Get the plumbing working end-to-end: 2 sample apps, 3 CDK stacks, a basic test suite, and GH Actions running it on every push to `main`. The goal is a green CI run that proves all three configurations deploy and respond correctly.

### Phase 2 — Extended coverage (follow-up)
Once Phase 1 is stable, layer in the additional test scenarios listed in the [Phase 2 test coverage](#phase-2-test-coverage) section at the end of this document.

---

## Configurations Under Test

| # | Label | SvelteKit adapter | Lambda runtime | Invoke mode |
|---|-------|-------------------|----------------|-------------|
| 1 | `EsbNode` | `kit-on-lambda` (esbuild) | Node.js 24 | `RESPONSE_STREAM` |
| 2 | `BunNode` | `kit-on-lambda/bun` + `runtime: "node"` | Node.js 24 | `RESPONSE_STREAM` |
| 3 | `BunBun` | `kit-on-lambda/bun` + `runtime: "bun"` | Bun (custom layer) | `RESPONSE_STREAM` |

All three use the CDK `SvelteKit` construct from `kit-on-lambda/cdk`. Configs 1 and 2 share the same SvelteKit source app (`examples/basic`). Config 3 uses a second app (`examples/streaming`) that exercises response streaming specifically.

---

## Directory Layout

```
examples/
├── basic/                          # SvelteKit app #1 — standard features
│   ├── src/routes/
│   │   ├── +page.svelte            # SSR home page (renders server data)
│   │   ├── +page.server.ts         # load() returning timestamp + env info
│   │   ├── +error.svelte           # Custom 404 / error page
│   │   ├── api/
│   │   │   ├── hello/+server.ts    # GET → { message, timestamp }
│   │   │   └── context/+server.ts  # GET → AWS event/context via getAwsEvent()
│   │   └── cookies/
│   │       ├── +page.svelte        # Renders set-cookie form + cookie value
│   │       └── +page.server.ts     # action: sets cookie; load: reads it back
│   ├── static/favicon.png
│   ├── svelte.config.js            # Reads ADAPTER_TYPE + ADAPTER_OUT env vars
│   ├── vite.config.ts
│   └── package.json
│
├── streaming/                      # SvelteKit app #2 — streaming features
│   ├── src/routes/
│   │   ├── +page.svelte            # Home page
│   │   ├── api/
│   │   │   ├── hello/+server.ts    # Basic GET endpoint
│   │   │   └── large/+server.ts    # Returns ~8 MB JSON payload (exceeds 6 MB buffered limit)
│   │   └── redirect/+server.ts    # Issues SvelteKit redirect(302)
│   ├── svelte.config.js            # bun adapter, runtime: "bun"
│   ├── vite.config.ts
│   └── package.json
│
└── infra/                          # Shared CDK infrastructure
    ├── bin/app.ts                  # CDK app entry — instantiates all three stacks
    ├── lib/
    │   ├── basic-esb-node-stack.ts     # Config 1: basic app, esbuild + Node.js
    │   ├── basic-bun-node-stack.ts     # Config 2: basic app, bun bundler + Node.js
    │   └── streaming-bun-bun-stack.ts  # Config 3: streaming app, bun bundler + Bun
    ├── cdk.json
    ├── tsconfig.json
    └── package.json

test/
└── integration/
    ├── deploy-destroy.test.ts      # Main orchestrator (deploy → test → destroy)
    └── helpers.ts                  # Shared fetch helpers and assertion utilities

scripts/
└── integ-cleanup.sh                # Destroys orphaned KitOnLambdaInteg-* stacks
```

---

## Example App Details

### `examples/basic/svelte.config.js`

Selects adapter via environment variables so the same source can produce two distinct builds:

```js
const adapterType = process.env.ADAPTER_TYPE ?? 'esb'
const out = process.env.ADAPTER_OUT ?? 'build'

const adapter =
  adapterType === 'bun'
    ? (await import('kit-on-lambda/bun')).default({ out, runtime: 'node' })
    : (await import('kit-on-lambda')).default({ out })

export default { kit: { adapter } }
```

CDK stacks invoke the build step with the appropriate env vars before synthesis:

```ts
// Config 1 — esbuild
spawnSync('bun', ['run', 'build'], {
  cwd: basicAppDir,
  env: { ...process.env, ADAPTER_TYPE: 'esb', ADAPTER_OUT: 'build-esb' },
})

// Config 2 — bun bundler
spawnSync('bun', ['run', 'build'], {
  cwd: basicAppDir,
  env: { ...process.env, ADAPTER_TYPE: 'bun', ADAPTER_OUT: 'build-bun' },
})
```

### `examples/streaming/svelte.config.js`

```js
import adapter from 'kit-on-lambda/bun'
export default { kit: { adapter: adapter({ runtime: 'bun' }) } }
```

---

## CDK Stacks

Each stack:
1. Builds the SvelteKit app (via `spawnSync` at synthesis time)
2. Instantiates `SvelteKit` from `kit-on-lambda/cdk` pointing at the build directory
3. Exports the CloudFront distribution URL as a stack output

```ts
// examples/infra/lib/basic-esb-node-stack.ts
import { SvelteKit } from 'kit-on-lambda/cdk'
import { InvokeMode } from 'aws-cdk-lib/aws-lambda'

export class BasicEsbNodeStack extends Stack {
  constructor(scope: App, id: string, props: StackProps) {
    super(scope, id, props)
    const sk = new SvelteKit(this, 'App', {
      buildDirectory: path.join(__dirname, '../../basic/build-esb'),
      runtime: 'node',
      invokeMode: InvokeMode.RESPONSE_STREAM,
    })
    new CfnOutput(this, 'DistributionUrl', {
      value: `https://${sk.distribution.distributionDomainName}`,
    })
  }
}
```

Stack names use a shared timestamp to group a test run:

```ts
const ts = process.env.INTEG_TIMESTAMP ?? Date.now().toString()
new BasicEsbNodeStack(app, `KitOnLambdaInteg-EsbNode-${ts}`, { env })
new BasicBunNodeStack(app, `KitOnLambdaInteg-BunNode-${ts}`, { env })
new StreamingBunBunStack(app, `KitOnLambdaInteg-BunBun-${ts}`, { env })
```

---

## Integration Test Structure

### `test/integration/deploy-destroy.test.ts`

```ts
const RUN_INTEG = process.env.RUN_AWS_INTEG === '1'

function describeInteg(label: string, fn: () => void) {
  if (!RUN_INTEG) {
    describe.skip(`[skipped — set RUN_AWS_INTEG=1] ${label}`, fn)
  } else {
    describe(label, fn)
  }
}

interface StackOutputs {
  EsbNodeUrl: string
  BunNodeUrl: string
  BunBunUrl: string
}

let outputs: StackOutputs
const ts = Date.now().toString()
const infraDir = path.join(__dirname, '../../examples/infra')

beforeAll(async () => {
  // 1. Build all apps
  buildApp('basic', { ADAPTER_TYPE: 'esb', ADAPTER_OUT: 'build-esb' })
  buildApp('basic', { ADAPTER_TYPE: 'bun', ADAPTER_OUT: 'build-bun' })
  buildApp('streaming', {})

  // 2. Deploy all stacks
  spawnSync('bunx', ['cdk', 'deploy', '--all',
    '--require-approval', 'never',
    '--outputs-file', 'outputs.json'],
    { cwd: infraDir, env: { ...process.env, INTEG_TIMESTAMP: ts }, stdio: 'inherit' })

  // 3. Parse outputs
  const raw = JSON.parse(fs.readFileSync(path.join(infraDir, 'outputs.json'), 'utf8'))
  outputs = {
    EsbNodeUrl: raw[`KitOnLambdaInteg-EsbNode-${ts}`].DistributionUrl,
    BunNodeUrl: raw[`KitOnLambdaInteg-BunNode-${ts}`].DistributionUrl,
    BunBunUrl:  raw[`KitOnLambdaInteg-BunBun-${ts}`].DistributionUrl,
  }
}, 30 * 60 * 1000) // 30 min

afterAll(async () => {
  try {
    spawnSync('bunx', ['cdk', 'destroy', '--all', '--force'],
      { cwd: infraDir, env: { ...process.env, INTEG_TIMESTAMP: ts }, stdio: 'inherit' })
  } catch {
    // fallback: cleanup script handles orphaned stacks
  }
}, 20 * 60 * 1000)
```

### Phase 1 Test Cases

Run the same suite against all three URLs, plus streaming-specific cases for `BunBunUrl`:

```ts
function basicSuite(label: string, getUrl: () => string) {
  describeInteg(label, () => {
    test('home page renders SSR content', async () => {
      const res = await fetch(getUrl())
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/text\/html/)
      expect(await res.text()).toContain('<html')
    })

    test('API route returns JSON', async () => {
      const res = await fetch(`${getUrl()}/api/hello`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('message')
    })

    test('AWS event is accessible via getAwsEvent()', async () => {
      const res = await fetch(`${getUrl()}/api/context`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('requestContext')
    })

    test('cookies are set and read back', async () => {
      // POST to /cookies action → sets cookie; GET reads it back
      const res = await fetch(`${getUrl()}/cookies`, {
        headers: { cookie: 'test=hello' },
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('hello')
    })

    test('static asset served via CloudFront', async () => {
      const res = await fetch(`${getUrl()}/favicon.png`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/image/)
    })

    test('custom 404 page is rendered', async () => {
      const res = await fetch(`${getUrl()}/does-not-exist`)
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('<html')
    })

    test('redirect is followed', async () => {
      const res = await fetch(`${getUrl()}/redirect`, { redirect: 'follow' })
      expect(res.status).toBe(200)
    })
  })
}

basicSuite('Config 1: esbuild + Node.js',     () => outputs.EsbNodeUrl)
basicSuite('Config 2: bun bundler + Node.js', () => outputs.BunNodeUrl)
basicSuite('Config 3: bun bundler + Bun',     () => outputs.BunBunUrl)

describeInteg('Config 3: streaming-specific', () => {
  test('large payload (>6 MB) is returned without error', async () => {
    const res = await fetch(`${outputs.BunBunUrl}/api/large`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.length).toBeGreaterThan(6 * 1024 * 1024)
  })
})
```

---

## Package Scripts

Add to the root `package.json`:

```json
{
  "scripts": {
    "integ:deploy-test-destroy": "RUN_AWS_INTEG=1 bun test test/integration/deploy-destroy.test.ts",
    "integ:cleanup": "bash scripts/integ-cleanup.sh"
  }
}
```

### `scripts/integ-cleanup.sh`

Destroys any orphaned `KitOnLambdaInteg-*` stacks left by interrupted runs:

```bash
#!/usr/bin/env bash
set -euo pipefail
stacks=$(aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ROLLBACK_COMPLETE \
  --query 'StackSummaries[].StackName' --output text)
for stack in $stacks; do
  case "$stack" in
    KitOnLambdaInteg-*)
      echo "Destroying $stack"
      (cd examples/infra && INTEG_STACK_NAME="$stack" bunx cdk destroy "$stack" --force)
      ;;
  esac
done
```

---

## AWS Account Setup

### 1. Bootstrap the account for CDK

CDK requires a bootstrap stack in the target account and region before any deployment. This creates an S3 bucket (for CDK assets) and IAM roles that CDK uses during deploy.

```bash
# One-time setup — run with admin credentials
export AWS_PROFILE=your-admin-profile
export CDK_NEW_BOOTSTRAP=1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

bunx cdk bootstrap aws://${ACCOUNT_ID}/eu-central-1
```

The bootstrap command creates the `CDKToolkit` CloudFormation stack. It only needs to be run once per account/region.

### 2. Create the integration test IAM role

Create a dedicated IAM role for integration test deployments with the minimum permissions needed. The role is assumed either via `AWS_PROFILE` locally or via OIDC in GitHub Actions.

**Minimum IAM policy** (attach to the role or an IAM user for local runs):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormation",
      "Effect": "Allow",
      "Action": [
        "cloudformation:*"
      ],
      "Resource": "arn:aws:cloudformation:*:ACCOUNT_ID:stack/KitOnLambdaInteg-*/*"
    },
    {
      "Sid": "CloudFormationList",
      "Effect": "Allow",
      "Action": [
        "cloudformation:ListStacks",
        "cloudformation:DescribeStacks"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Lambda",
      "Effect": "Allow",
      "Action": [
        "lambda:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3",
      "Effect": "Allow",
      "Action": [
        "s3:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": [
        "cloudfront:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SecretsManager",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:*"
      ],
      "Resource": "arn:aws:secretsmanager:*:ACCOUNT_ID:secret:*"
    },
    {
      "Sid": "IAM",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:PassRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SSM",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter"
      ],
      "Resource": "arn:aws:ssm:*:ACCOUNT_ID:parameter/cdk-bootstrap/*"
    },
    {
      "Sid": "CDKAssetsBucket",
      "Effect": "Allow",
      "Action": [
        "sts:AssumeRole"
      ],
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/cdk-*"
    }
  ]
}
```

> **Note:** The `sts:AssumeRole` on `cdk-*` roles is needed because CDK splits deployment into lookup, deploy, and publish roles — all created by `cdk bootstrap`. The integration test role assumes these CDK-managed roles during `cdk deploy`.

**Create the role via CLI** (run with admin credentials):

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Trust policy — allows any IAM principal in the account to assume the role
aws iam create-role \
  --role-name kit-on-lambda-integ \
  --assume-role-policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Principal\": { \"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\" },
      \"Action\": \"sts:AssumeRole\"
    }]
  }"

# Permissions policy — substitute ACCOUNT_ID then attach
sed "s/ACCOUNT_ID/${ACCOUNT_ID}/g" docs/iam-policy.json > /tmp/integ-policy.json
aws iam put-role-policy \
  --role-name kit-on-lambda-integ \
  --policy-name kit-on-lambda-integ-permissions \
  --policy-document file:///tmp/integ-policy.json
```

If you prefer not to create a role and instead run with direct IAM user credentials, skip this step — just ensure the IAM user has the same policy attached and configure `~/.aws/credentials` accordingly.

### 3. Configure OIDC trust for GitHub Actions

In the AWS IAM console, add a trust policy to the integration role so GitHub Actions can assume it without long-lived credentials:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:BeeSolve/kit-on-lambda:*"
        }
      }
    }
  ]
}
```

**Configure via CLI** (run with admin credentials):

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create the OIDC provider if it doesn't exist yet
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  2>/dev/null || echo "OIDC provider already exists, skipping"

# Replace the role trust policy with the merged local IAM + OIDC version
aws iam update-assume-role-policy \
  --role-name kit-on-lambda-integ \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Effect\": \"Allow\",
        \"Principal\": { \"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\" },
        \"Action\": \"sts:AssumeRole\"
      },
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
            \"token.actions.githubusercontent.com:sub\": \"repo:BeeSolve/kit-on-lambda:*\"
          }
        }
      }
    ]
  }"

# Store the role ARN as a GitHub Actions secret
gh secret set AWS_INTEG_ROLE_ARN \
  --body "arn:aws:iam::${ACCOUNT_ID}:role/kit-on-lambda-integ"
```

### 4. Local credential setup

For running tests locally, configure a named profile that assumes the integration role:

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws configure set profile.kit-on-lambda-integ.role_arn "arn:aws:iam::${ACCOUNT_ID}:role/kit-on-lambda-integ"
aws configure set profile.kit-on-lambda-integ.source_profile default
aws configure set profile.kit-on-lambda-integ.region eu-central-1
```

This appends the following to `~/.aws/config` (equivalent manual form):

```ini
[profile kit-on-lambda-integ]
role_arn = arn:aws:iam::ACCOUNT_ID:role/kit-on-lambda-integ
source_profile = default
region = eu-central-1
```

Then export the profile before running:

```bash
export AWS_PROFILE=kit-on-lambda-integ
export AWS_REGION=eu-central-1
bun run integ:deploy-test-destroy
```

---

## GitHub Actions Workflow

Create `.github/workflows/integration.yml`:

```yaml
name: Integration Tests

on:
  workflow_call:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'examples/**'
      - 'test/integration/**'
      - '*.ts'

concurrency:
  group: integ-${{ github.ref }}
  cancel-in-progress: false

jobs:
  integ:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      id-token: write
      contents: read
    env:
      AWS_REGION: eu-central-1
      CI: true
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: ${{ secrets.AWS_INTEG_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      - run: bun install --frozen-lockfile
      - name: Install example app deps
        run: |
          bun install --frozen-lockfile --cwd examples/basic
          bun install --frozen-lockfile --cwd examples/streaming
          bun install --frozen-lockfile --cwd examples/infra
      - name: Build adapter
        run: bun run prepublishOnly
      - name: Run integration tests
        run: bun run integ:deploy-test-destroy
      - name: Cleanup (always)
        if: always()
        run: bun run integ:cleanup
```

---

## Local Development

```bash
# Prerequisites: AWS credentials configured (see AWS Account Setup above),
# CDK bootstrapped in the target account/region.

export AWS_PROFILE=kit-on-lambda-integ
export AWS_REGION=eu-central-1

# Full deploy → test → destroy cycle
bun run integ:deploy-test-destroy

# Clean up orphaned stacks from interrupted runs
bun run integ:cleanup

# Deploy only (no tests — useful for manual inspection)
cd examples/infra
INTEG_TIMESTAMP=manual bunx cdk deploy --all --require-approval never --outputs-file outputs.json
```

---

## Phase 1 Implementation Checklist

- [x] `examples/basic/` — SvelteKit app with routes: `/`, `/api/hello`, `/api/context`, `/cookies`, `/redirect`
- [x] `examples/basic/svelte.config.js` — ADAPTER_TYPE / ADAPTER_OUT env var support
- [x] `examples/streaming/` — SvelteKit app with `/api/large` returning > 6 MB payload
- [x] `examples/infra/` — CDK app with three stacks (EsbNode, BunNode, BunBun)
- [x] `examples/infra/package.json` — CDK deps: `aws-cdk`, `aws-cdk-lib`, `constructs`
- [x] Each example app `package.json` — `kit-on-lambda` as local file dep (`"kit-on-lambda": "file:../.."`), `@sveltejs/kit`, `vite`
- [x] `test/integration/deploy-destroy.test.ts` — deploy/test/teardown with `bun:test`
- [x] `test/integration/helpers.ts` — shared fetch utilities
- [x] `scripts/integ-cleanup.sh` — orphaned stack cleanup
- [x] Root `package.json` — add `integ:deploy-test-destroy` and `integ:cleanup` scripts
- [x] `.github/workflows/integration.yml` — CI workflow
- [ ] AWS account bootstrapped and OIDC role created
- [ ] `AWS_INTEG_ROLE_ARN` secret added to GitHub repository

---

## Phase 2 Test Coverage

Once Phase 1 is stable, add the following test scenarios:

1. **CloudFront cache headers on repeated requests** — assert `x-cache: Hit from cloudfront` on a second request for the same static asset, verifying the S3 caching path works.

2. **Precompressed assets** — assert `content-encoding: gzip` on static JS bundles (requires CloudFront to forward `Accept-Encoding`).

3. **x-origin-token bypass blocked** — extract the Lambda Function URL from the CDK stack output, call it directly without the `x-origin-token` header, assert 403. Verifies the origin-protection secret is enforced.

4. **Warm invocation response time** — after the first request (cold start), measure P95 of 5 subsequent calls and assert < 500 ms. Provides a performance regression signal.

5. **Set-Cookie roundtrip** — post a form that sets `SameSite=None; Secure` cookies, read them back in the next request, assert the full serialised value survives CloudFront passthrough intact.

6. **Basic auth stack variant** — add a fourth CDK stack with `basicHttpAuthentication` enabled; assert unauthenticated requests return 401 and requests with a valid `Authorization` header succeed.
