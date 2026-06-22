#!/usr/bin/env bash
#
# Package AurexLive source code into a tar.gz archive for deployment.
# Excludes node_modules, runtime data, and other non-essential files.
#
# Usage: bash scripts/package-tar.sh [output-path]
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUTPUT_PATH="${1:-}"
if [ -z "$OUTPUT_PATH" ]; then
  OUTPUT_PATH="$ROOT_DIR/dist/aurexlive-$(date +%Y%m%d-%H%M%S).tar.gz"
fi

log() { printf '\n[package-tar] %s\n' "$*"; }

log "Packaging AurexLive from: $ROOT_DIR"
log "Output: $OUTPUT_PATH"

mkdir -p "$(dirname "$OUTPUT_PATH")"

# Use find to generate the file list excluding development/transient files.
# Piped to tar via -T - for portability across BSD and GNU tar.
find . \
  -not -path './node_modules/*' \
  -not -path './.git/*' \
  -not -path './runtime/*' \
  -not -path './recordings/*' \
  -not -path './uploads/*' \
  -not -path './show_record/*' \
  -not -path './frontend/dist/*' \
  -not -path './.vscode/*' \
  -not -name '.DS_Store' \
  -not -name '.env.dev' \
  -not -name '.env.prd' \
  -type f -o -type d -name '.git' -prune \
  | sed 's|^\./||' \
  | tar czf "$OUTPUT_PATH" -C "$ROOT_DIR" -T -

log "Package created successfully!"
log "File size: $(du -h "$OUTPUT_PATH" | cut -f1)"
log ""
log "Deploy on target server:"
log "  1. tar xzf $(basename "$OUTPUT_PATH")"
log "  2. cd aurexlive"
log "  3. npm install --production"
log "  4. Edit .env.prd with your settings"
log "  5. npm start"
