const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

function installFileLogger(logDirectory) {
  fs.mkdirSync(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, 'desktop.log');
  const stream = fs.createWriteStream(logPath, { flags: 'a' });

  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      const line = args.map((value) => (typeof value === 'string' ? value : util.inspect(value))).join(' ');
      stream.write(`${new Date().toISOString()} [${level.toUpperCase()}] ${line}\n`);
    };
  }

  return { logPath, close: () => stream.end() };
}

module.exports = { installFileLogger };
