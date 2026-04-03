#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../middleware/logger');

const logger = createLogger({ source: 'generate-openapi' });

// Try to load swagger-jsdoc
let swaggerJSDoc;
try {
  swaggerJSDoc = require('swagger-jsdoc');
} catch (err) {
  logger.error('swagger-jsdoc is not installed. Run `npm --prefix backend install swagger-jsdoc` to install it.', 'main');
  process.exit(1);
}

const backendRoot = path.join(__dirname, '..');
const outPath = path.join(backendRoot, 'config', 'openapi.generated.json');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'FileTransfer API (generated)',
      version: '1.0.0',
      description: 'Auto-generated OpenAPI spec (paths discovered from JSDoc comments)'
    },
    servers: [ { url: 'http://localhost:3000', description: 'local' } ]
  },
  apis: [
    path.join(backendRoot, 'routes', '**', '*.js'),
    path.join(backendRoot, 'routes', '*.js')
  ]
};

try {
  const spec = swaggerJSDoc(options);
  fs.writeFileSync(outPath, JSON.stringify(spec, null, 2), 'utf8');
  logger.info(`[openapi] Generated ${outPath}`, 'main');
} catch (err) {
  logger.error(`[openapi] generation failed: ${err && err.message ? err.message : err}`, 'main');
  process.exit(2);
}
