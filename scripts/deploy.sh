#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '\n[deploy] %s\n' "$*"
}

use_ci_install="${USE_CI_INSTALL:-1}"
skip_install="${SKIP_INSTALL:-0}"
pm2_ecosystem_file="${PM2_ECOSYSTEM_FILE:-ecosystem.config.js}"
pm2_env="${PM2_ENV:-production}"

install_dependencies() {
  if [[ "$skip_install" == "1" ]]; then
    log "Skipping dependency installation"
    return
  fi

  log "Installing root dependencies"
  if [[ -f package-lock.json && "$use_ci_install" == "1" ]]; then
    npm ci
  else
    npm install
  fi
}

log "Preparing release"
install_dependencies

log "Building frontend production bundle"
npm run build

log "Starting or reloading PM2 apps"
npx pm2 startOrReload "$pm2_ecosystem_file" --env "$pm2_env" --update-env
npx pm2 save

log "Deployment complete"
npx pm2 status