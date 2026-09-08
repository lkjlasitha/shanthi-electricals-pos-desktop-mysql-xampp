const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

const MAX_LOG_BYTES = 5 * 1024 * 1024;

function rotateLog(logPath) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size < MAX_LOG_BYTES) return;
    const previous = `${logPath}.1`;
    if (fs.existsSync(previous)) fs.unlinkSync(previous);
    fs.renameSync(logPath, previous);
  } catch (error) {
    // Logging must never prevent the POS from starting.
    console.error('Could not rotate the desktop log:', error.message);
  }
}

function installFileLogger(logDirectory) {
  fs.mkdirSync(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, 'desktop.log');
  rotateLog(logPath);
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  const originalConsole = Object.fromEntries(
    ['log', 'info', 'warn', 'error'].map((level) => [level, console[level].bind(console)])
  );
  let streamHealthy = true;
  stream.on('error', (error) => {
    streamHealthy = false;
    originalConsole.error('Desktop file logging stopped:', error.message);
  });

  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = originalConsole[level];
    console[level] = (...args) => {
      original(...args);
      const line = args.map((value) => (typeof value === 'string' ? value : util.inspect(value))).join(' ');
      if (streamHealthy) stream.write(`${new Date().toISOString()} [${level.toUpperCase()}] ${line}\n`);
    };
  }

  return { logPath, close: () => stream.end() };
}

module.exports = { MAX_LOG_BYTES, installFileLogger, rotateLog };
