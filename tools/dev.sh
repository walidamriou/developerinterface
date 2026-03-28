#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CODE="$(command -v code || true)"
if [ -z "$CODE" ]; then
	CODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
fi

echo "Starting DeveloperInterface in development mode..."
"$CODE" --extensionDevelopmentPath="$ROOT_DIR"
