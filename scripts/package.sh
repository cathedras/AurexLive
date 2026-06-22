#!/usr/bin/env bash
#
# Package AurexLive source code for transfer to a Windows machine.
# Creates a .zip archive excluding node_modules, runtime data, etc.
#
# Usage: bash scripts/package.sh [output-path]
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUTPUT_PATH="${1:-}"
if [ -z "$OUTPUT_PATH" ]; then
  OUTPUT_PATH="$(dirname "$ROOT_DIR")/aurexlive-windows-package.zip"
fi

log() {
  printf '\n[package] %s\n' "$*"
}

log "Packaging AurexLive from: $ROOT_DIR"
log "Output: $OUTPUT_PATH"

EXCLUDE=(
  "node_modules"
  ".git"
  "runtime"
  "recordings"
  "uploads"
  "show_record"
  "frontend/dist"
  ".vscode"
)

EXCLUDE_ARGS=()
for pattern in "${EXCLUDE[@]}"; do
  EXCLUDE_ARGS+=("-x" "$pattern/*")
done

zip -r "$OUTPUT_PATH" . "${EXCLUDE_ARGS[@]}" > /dev/null

log "Package created successfully!"
log "File size: $(du -h "$OUTPUT_PATH" | cut -f1)"
log ""
log "Next steps on Windows:"
log "  1. Extract the zip to C:\\aurexlive (or any path)"
log "  2. Install Node.js from https://nodejs.org/"
log "  3. Install ffmpeg from https://ffmpeg.org/ (add to PATH)"
log "  4. Open PowerShell as Administrator in the project folder"
log "  5. Run: .\\scripts\\deploy.ps1"
