#!/usr/bin/env sh
# Run this from any directory; no npm installation is needed in the play package.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js is required. Install Node.js 22 LTS from https://nodejs.org, then run this file again.'
  exit 1
fi
exec node ./serve.mjs "$@"
