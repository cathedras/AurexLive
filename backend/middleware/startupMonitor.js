const path = require('path');
const child_process = require('child_process');

function createStartupMonitor(options = {}) {
  const {
    appNames = ['monitor-worker', 'show-console'],
    maxAttempts = 3,
    retryBaseDelayMs = 2000,
    initialDelayMs = 50,
    ecosystemConfigPath = path.resolve(__dirname, '..', '..', 'ecosystem.config.js'),
    logger = console
  } = options;

  function fallbackStart(missingApps) {
    missingApps.forEach((app) => {
      try {
        logger.log(`[PM2] Fallback: starting ${app} via npx pm2`);
        const args = ['pm2', 'start', ecosystemConfigPath, '--only', app];
        const child = child_process.spawn('npx', args, { stdio: 'inherit' });
        child.on('close', (code) => {
          logger.log(`[PM2] npx pm2 start ${app} exited with ${code}`);
        });
      } catch (error) {
        logger.warn('[PM2] Fallback start failed for', app, error && error.message);
      }
    });
  }

  function loadPm2() {
    try {
      return require('pm2');
    } catch (error) {
      return null;
    }
  }

  function connectPm2(pm2) {
    return new Promise((resolve, reject) => {
      pm2.connect((connectErr) => {
        if (connectErr) {
          reject(connectErr);
          return;
        }
        resolve();
      });
    });
  }

  function listPm2(pm2) {
    return new Promise((resolve, reject) => {
      pm2.list((listErr, list) => {
        if (listErr) {
          reject(listErr);
          return;
        }
        resolve(list || []);
      });
    });
  }

  function startPm2App(pm2, app) {
    return new Promise((resolve) => {
      pm2.start(ecosystemConfigPath, { only: app }, (startErr) => {
        resolve({ app, startErr });
      });
    });
  }

  async function ensurePm2AppsRunning() {
    const pm2 = loadPm2();
    if (!pm2) {
      logger.warn('[PM2] pm2 module not available, using npx fallback');
      fallbackStart(appNames);
      return;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await connectPm2(pm2);
        logger.log('[PM2] 已连接到 PM2 进程管理器');

        try {
          const list = await listPm2(pm2);
          const running = new Set(list.map((processInfo) => processInfo.name));
          const missing = appNames.filter((app) => !running.has(app));

          if (missing.length === 0) {
            appNames.forEach((app) => {
              logger.log(`[PM2] 服务运行成功: ${app}`);
            });
            logger.log('[PM2] 所有辅助服务已正常运行');
            pm2.disconnect();
            return;
          }

          const results = await Promise.all(missing.map((app) => startPm2App(pm2, app)));
          results.forEach(({ app, startErr }) => {
            if (startErr) {
              logger.warn('[PM2] failed to start', app, startErr && startErr.message);
            } else {
              logger.log(`[PM2] 服务启动成功: ${app}`);
            }
          });

          pm2.disconnect();

          const hasFailure = results.some(({ startErr }) => Boolean(startErr));
          if (!hasFailure) {
            results.forEach(({ app }) => {
              logger.log(`[PM2] 服务运行成功: ${app}`);
            });
            logger.log('[PM2] 所有缺失的辅助服务已启动完成');
            return;
          }

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, retryBaseDelayMs * attempt));
            continue;
          }

          fallbackStart(missing);
          return;
        } catch (error) {
          logger.warn('[PM2] startup check failed:', error && error.message);
          pm2.disconnect();

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, retryBaseDelayMs * attempt));
            continue;
          }

          fallbackStart(appNames);
          return;
        }
      } catch (error) {
        logger.warn('[PM2] connect error:', error && error.message);

        try {
          pm2.disconnect();
        } catch (disconnectErr) {}

        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryBaseDelayMs * attempt));
          continue;
        }

        fallbackStart(appNames);
        return;
      }
    }
  }

  function run() {
    setTimeout(() => {
      Promise.all([ensurePm2AppsRunning()])
        .then(() => {
          logger.log('[Startup] 后续启动监测流程已全部完成');
        })
        .catch((error) => {
          logger.warn('[Startup] unexpected startup monitor error:', error && error.message);
        });
    }, initialDelayMs);
  }

  return {
    run,
    ensurePm2AppsRunning,
    fallbackStart
  };
}

module.exports = createStartupMonitor;