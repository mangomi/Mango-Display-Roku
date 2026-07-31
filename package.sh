#!/bin/bash
# Builds MangoDisplayRoku.zip ready for sideloading (manifest must sit at
# the zip root, which is why this zips the contents, not the folder).
set -euo pipefail
cd "$(dirname "$0")"
rm -f MangoDisplayRoku.zip
zip -r MangoDisplayRoku.zip manifest source components images -x '*.DS_Store'
echo ""
echo "Created MangoDisplayRoku.zip"
echo "Install via browser at http://ROKU_TV_IP (Application Installer), or:"
echo "  curl -u rokudev:YOUR_DEV_PASSWORD --digest -F 'mysubmit=Install' -F 'archive=@MangoDisplayRoku.zip' http://ROKU_TV_IP/plugin_install"
