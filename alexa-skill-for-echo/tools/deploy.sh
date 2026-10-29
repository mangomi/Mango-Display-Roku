#!/bin/sh
# Deploys the skill's Lambda (test unless told otherwise). Runs the unit
# tests first; a failing test deploys nothing.
#
#   alexa-skill-for-echo/tools/deploy.sh            -> echo-show-app-test
#   alexa-skill-for-echo/tools/deploy.sh <function> -> another function
#
# The screen's code package (lambda/apl-package.js) goes up first, to
# s3://mango-echo-assets/<APL_ROOT, default test>/echo/apl/, only when that
# version is not there yet (versions are never overwritten), and must be
# served before the Lambda that imports it goes live.
#
# The zip carries a copy of the Roku's images/spinner.png (spinner.js), so
# both clients show the same art from the same file.
set -e
cd "$(dirname "$0")/../lambda"
FN="${1:-echo-show-app-test}"
npm test --silent >/dev/null 2>&1 || { echo "tests failed - not deploying"; npm test 2>&1 | grep -E "^not ok" ; exit 1; }
TMP="$(mktemp -d)"
cp *.js package.json "$TMP/"
cp ../../images/spinner.png "$TMP/"
# the package is built from the zip's own files, so its version is the one
# the deployed Lambda will ask for
PKG="$(cd "$TMP" && node -e 'process.stdout.write(require("./apl-package").fileName())')"
KEY="${APL_ROOT:-test}/echo/apl/$PKG"
if ! aws s3api head-object --bucket mango-echo-assets --key "$KEY" >/dev/null 2>&1; then
  PKGFILE="$(mktemp)"
  (cd "$TMP" && node -e 'process.stdout.write(require("./apl-package").json())') > "$PKGFILE"
  aws s3 cp "$PKGFILE" "s3://mango-echo-assets/$KEY" --only-show-errors \
    --content-type application/json --cache-control "public, max-age=31536000, immutable"
  rm -f "$PKGFILE"
  echo "uploaded package $PKG"
fi
curl -sf -o /dev/null -H "Origin: https://www.amazon.com" "https://rokuassets.mangodisplay.com/$KEY" \
  || { echo "package $KEY is not being served - not deploying"; rm -rf "$TMP"; exit 1; }
(cd "$TMP" && zip -q -r lambda.zip . -x lambda.zip)
AWS_PAGER="" aws lambda update-function-code --region us-east-1 --function-name "$FN" \
  --zip-file "fileb://$TMP/lambda.zip" --query LastUpdateStatus --output text >/dev/null
aws lambda wait function-updated-v2 --region us-east-1 --function-name "$FN"
rm -rf "$TMP"
echo "deployed $FN at $(date -u +%H:%M:%SZ)"
