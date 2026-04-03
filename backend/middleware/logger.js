const path = require('path');
const util = require('util');

const LEVEL_NAMES = {
  info: 'info',
  warning: 'warning',
  error: 'error'
};

function formatTimestamp(date = new Date()) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function normalizeSourceName(name) {
  return String(name || 'anonymous')
    .replace(/^Object\./, '')
    .replace(/^Module\./, '')
    .replace(/^async /, '')
    .trim() || 'anonymous';
}

function parseStackFrame(line) {
  const match = String(line || '').match(/^\s*at\s+(?:(.*?)\s+)?\(?(.+?):(\d+):(\d+)\)?$/);
  if (!match) {
    return null;
  }

  return {
    fn: match[1] ? normalizeSourceName(match[1]) : null,
    filePath: match[2],
    line: Number(match[3]),
    column: Number(match[4])
  };
}

function getCallerSource(skipFiles = []) {
  const stackLines = new Error().stack ? new Error().stack.split('\n').slice(2) : [];
  const skipSet = new Set(skipFiles.map((item) => path.resolve(item)));

  for (const line of stackLines) {
    const frame = parseStackFrame(line);
    if (!frame || !frame.filePath) {
      continue;
    }

    if (frame.filePath.startsWith('node:') || frame.filePath.includes('internal/')) {
      continue;
    }

    const resolvedFilePath = path.resolve(frame.filePath);
    if (skipSet.has(resolvedFilePath)) {
      continue;
    }

    const sourceName = frame.fn || path.basename(frame.filePath, path.extname(frame.filePath));
    return normalizeSourceName(sourceName);
  }

  return 'unknown';
}

function formatLogLine(level, source, message) {
  const normalizedLevel = LEVEL_NAMES[level] || 'info';
  const timestamp = formatTimestamp();
  return `[${normalizedLevel}  [${timestamp}] ${source}]: ${message}`;
}

function createLogger(options = {}) {
  const baseSource = options.source || null;
  const skipFiles = [__filename].concat(options.skipFiles || []);
  const output = options.output || global.__FILETRANSFER_GLOBAL_LOGGER_CONSOLE__ || console;

  const write = (level, inputMessage, inputSource) => {
    const source = normalizeSourceName(inputSource || baseSource || getCallerSource(skipFiles));
    const message = inputMessage instanceof Error ? (inputMessage.stack || inputMessage.message) : String(inputMessage);
    const line = formatLogLine(level, source, message);

    if (level === 'error') {
      output.error(line);
      return;
    }

    if (level === 'warning') {
      output.warn(line);
      return;
    }

    output.log(line);
  };

  return {
    info: (message, source) => write('info', message, source),
    warning: (message, source) => write('warning', message, source),
    warn: (message, source) => write('warning', message, source),
    error: (message, source) => write('error', message, source),
    child: (source) => createLogger({ source, skipFiles })
  };
}

function installGlobalLogger(options = {}) {
  if (global.__FILETRANSFER_GLOBAL_LOGGER_INSTALLED__) {
    return global.__FILETRANSFER_GLOBAL_LOGGER__;
  }

  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
  };

  const logger = createLogger({
    ...options,
    output: originalConsole
  });

  const write = (level, args) => {
    const message = util.format(...args);
    if (level === 'error') {
      logger.error(message);
      return;
    }

    if (level === 'warning') {
      logger.warning(message);
      return;
    }

    logger.info(message);
  };

  console.log = (...args) => write('info', args);
  console.info = (...args) => write('info', args);
  console.warn = (...args) => write('warning', args);
  console.error = (...args) => write('error', args);
  if (console.debug) {
    console.debug = (...args) => write('info', args);
  }

  global.__FILETRANSFER_GLOBAL_LOGGER_INSTALLED__ = true;
  global.__FILETRANSFER_GLOBAL_LOGGER__ = logger;
  global.__FILETRANSFER_GLOBAL_LOGGER_CONSOLE__ = originalConsole;

  return logger;
}

module.exports = {
  createLogger,
  installGlobalLogger,
  formatTimestamp,
  getCallerSource,
  formatLogLine
};