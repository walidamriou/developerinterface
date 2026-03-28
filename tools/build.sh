#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "Installing vsce..."
# npm install -g @vscode/vsce

echo "Packaging extension..."
vsce package --allow-missing-repository

echo "Done! .vsix file created."
