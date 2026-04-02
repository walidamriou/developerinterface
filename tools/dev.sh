#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CODE="$(command -v code || true)"
USE_FLATPAK=0
if [ -z "$CODE" ]; then
	# Keep the original macOS fallback path.
	if [ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]; then
		CODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
	# Linux fallback for VS Code installed via Flatpak.
	elif command -v flatpak >/dev/null 2>&1 && flatpak info com.visualstudio.code >/dev/null 2>&1; then
		USE_FLATPAK=1
	# Linux fallback for VS Code/Codium binaries.
	elif command -v codium >/dev/null 2>&1; then
		CODE="$(command -v codium)"
	elif command -v code-insiders >/dev/null 2>&1; then
		CODE="$(command -v code-insiders)"
	fi
fi

echo "Starting DeveloperInterface in development mode..."
if [ "$USE_FLATPAK" -eq 1 ]; then
	flatpak run com.visualstudio.code --extensionDevelopmentPath="$ROOT_DIR"
elif [ -n "$CODE" ]; then
	"$CODE" --extensionDevelopmentPath="$ROOT_DIR"
else
	echo "Error: Could not find VS Code launcher. Install 'code' on PATH or VS Code Flatpak." >&2
	exit 1
fi
