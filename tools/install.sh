#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

VSIX=$(ls *.vsix 2>/dev/null | head -1)

if [ -z "$VSIX" ]; then
  echo "No .vsix file found. Run ./tools/build.sh first."
  exit 1
fi

CODE="$(command -v code || true)"
if [ -z "$CODE" ]; then
  CODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
fi

echo "Uninstalling old version to clear cache..."
"$CODE" --uninstall-extension walidamriou.developerinterface 2>/dev/null || true

echo "Installing $VSIX into VS Code..."
"$CODE" --install-extension "$VSIX"

echo "Done! Fully restart VS Code (Cmd+Q then reopen) to see the updated icon."
