#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../examples/infra"

stacks=$(aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ROLLBACK_COMPLETE UPDATE_ROLLBACK_COMPLETE \
  --query 'StackSummaries[].StackName' \
  --output text)

if [ -z "$stacks" ]; then
  echo "No stacks found."
  exit 0
fi

for stack in $stacks; do
  case "$stack" in
    KitOnLambdaInteg-*)
      echo "Destroying $stack"
      (cd "$INFRA_DIR" && bunx cdk destroy "$stack" --force)
      ;;
  esac
done
