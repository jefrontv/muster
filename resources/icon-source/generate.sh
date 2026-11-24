#!/bin/bash
# Generate every app icon from the Formation geometry (no Xcode or ImageMagick needed).
# Produces: resources/build/icon.icns (macOS), icon.ico (Windows), icon.png (fallback),
# resources/icon.png and icon-dev.png (runtime), resources/app-icons/, resources/tray/.
# icon.icon is the layered Icon Composer source for the macOS 26 appearances; it is
# not compiled here until those modes are checked against the flat .icns.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

node "$PROJECT_DIR/config/scripts/render-formation-icons.mjs"
echo "Done! Icons generated in resources/build/, resources/app-icons/ and resources/tray/"
