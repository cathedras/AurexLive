#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
const { createLogger } = require('../middleware/logger');

const logger = createLogger({ source: 'watch-openapi' });

let chokidar;
try {
  chokidar = require('chokidar');
} catch (err) {
  logger.error('chokidar is not installed. Run `npm --prefix backend install chokidar` to install it.', 'main');
  process.exit(1);
}

const backendRoot = path.join(__dirname, '..');
const watchPaths = [
  path.join(backendRoot, 'routes'),
  path.join(backendRoot, 'config')
];

function generate() {
  const proc = spawn('node', [path.join(__dirname, 'generate-openapi.js')], { stdio: 'inherit' });
  proc.on('close', (code) => {
    if (code === 0) {
      logger.info('[openapi-watch] generation completed', 'generate');
    } else {
      logger.warning(`[openapi-watch] generation failed, exit code ${code}`, 'generate');
    }
  });
}

const watcher = chokidar.watch(watchPaths, { ignored: /node_modules|\.git/, ignoreInitial: false });
watcher.on('all', (event, p) => {
  logger.info(`[openapi-watch] detected change: ${event} ${p}`, 'watcher');
  generate();
});

logger.info(`[openapi-watch] watching ${watchPaths.join(', ')}`, 'main');
