#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm run build

if ! compgen -G "dist/assets/*.js" > /dev/null; then
  echo "FAIL: no dist/assets/*.js found after build" >&2
  exit 1
fi

if grep -lq '@google/genai' dist/assets/*.js 2>/dev/null; then
  echo "FAIL: @google/genai found in client bundle" >&2
  exit 1
fi

if grep -lE 'AIza[0-9A-Za-z_-]{35}' dist/assets/*.js 2>/dev/null; then
  echo "FAIL: Google API key pattern found in client bundle" >&2
  exit 1
fi

echo "OK: client bundle is clean"
