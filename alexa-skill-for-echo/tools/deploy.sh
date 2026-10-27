#!/bin/sh
# Deploys the skill's Lambda (test unless told otherwise). Runs the unit
# tests first; a failing test deploys nothing.
#
#   alexa-skill-for-echo/tools/deploy.sh            -> echo-show-app-test
#   alexa-skill-for-echo/tools/deploy.sh <function> -> another function
#
# The zip carries a copy of the Roku's images/spinner.png (spinner.js), so
# both clients show the same art from the same file.
set -e
cd "$(dirname "$0")/../lambda"
FN="${1:-echo-show-app-test}"
npm test --silent >/dev/null 2>&1 || { echo "tests failed - not deploying"; npm test 2>&1 | grep -E "^not ok" ; exit 1; }
TMP="$(mktemp -d)"
cp index.js env.js identity.js backend.js clock.js apl.js touch.js spinner.js package.json "$TMP/"
cp ../../images/spinner.png "$TMP/"
(cd "$TMP" && zip -q -r lambda.zip . -x lambda.zip)
AWS_PAGER="" aws lambda update-function-code --region us-east-1 --function-name "$FN" \
  --zip-file "fileb://$TMP/lambda.zip" --query LastUpdateStatus --output text >/dev/null
aws lambda wait function-updated-v2 --region us-east-1 --function-name "$FN"
rm -rf "$TMP"
echo "deployed $FN at $(date -u +%H:%M:%SZ)"
