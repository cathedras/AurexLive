const { installGlobalLogger } = require('./middleware/logger');

installGlobalLogger();

const { createLogger } = require('./middleware/logger');

const logger = createLogger({ source: 'monitorWorker' });
function main() {
  logger.info('monitorWorker: monitor persistence disabled; worker kept for future system-level persistence hooks', 'main');
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  process.on('uncaughtException', (err) => {
    logger.error(err && err.stack ? err.stack : `monitorWorker: uncaughtException ${String(err)}`, 'main');
    process.exit(1);
  });

  setInterval(() => {}, 60 * 60 * 1000);
}

main();
