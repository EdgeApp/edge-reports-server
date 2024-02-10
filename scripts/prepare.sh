#!/bin/sh

# The Edge application uses WebView components extensively.
# These components need various JS files to operate,
# so this script prepares those.

set -e
cd "$(dirname "$0")/.."

# Assemble the clientConfig.json config file:
node -r sucrase/register ./src/bin/configure.ts
