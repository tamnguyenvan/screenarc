// Sets up the logging system.

import log from 'electron-log/main';

export function setupLogging() {
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB

  if (process.env.NODE_ENV !== 'development') {
    log.transports.console.level = false;
  }

  process.on('uncaughtException', (error) => {
    log.error('Unhandled Exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  log.info('[Logging] Logging initialized.');
}