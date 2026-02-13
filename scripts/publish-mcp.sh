#!/usr/bin/env bash
#
# Publish the Holibob MCP Server to npm as the "holibob-mcp" package.
#
# This script:
# 1. Builds a standalone bundle (tsup → publish-dist/)
# 2. Temporarily swaps package.json with package.publish.json
# 3. Runs npm publish (or npm pack --dry-run for testing)
# 4. Restores the original package.json
#
# Usage:
#   ./scripts/publish-mcp.sh          # Dry run (npm pack)
#   ./scripts/publish-mcp.sh --publish # Actually publish to npm
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/mcp-server"

echo "==> Building MCP server bundle..."
cd "$PKG_DIR"
npm run build:publish

echo "==> Preparing package for publish..."
cp package.json package.json.bak
cp package.publish.json package.json

cleanup() {
  echo "==> Restoring original package.json..."
  cd "$PKG_DIR"
  mv package.json.bak package.json
}
trap cleanup EXIT

if [ "${1:-}" = "--publish" ]; then
  echo "==> Publishing to npm..."
  npm publish --access public
  echo "==> Published holibob-mcp successfully!"
else
  echo "==> Dry run (pack only)..."
  npm pack --dry-run
  echo ""
  echo "To actually publish, run: ./scripts/publish-mcp.sh --publish"
fi
