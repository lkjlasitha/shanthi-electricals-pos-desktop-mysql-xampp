const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const fs = require('node:fs');

const projectRoot = path.resolve(__dirname, '..');
const children = new Map();
let shuttingDown = false;
let exitCode = 0;

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function prefixOutput(stream, label, target) {
  if (!stream) return;
  const reader = readline.createInterface({ input: stream });
  reader.on('line', (line) => target.write(`[${label}] ${line}\n`));
}

function getNpmInvocation(directory) {
  // When this file is started by `npm run dev`, npm exposes the JavaScript CLI
  // entry point through npm_execpath. Running that file with the current Node
  // executable works on Windows, macOS, and Linux and avoids spawning npm.cmd.
  const npmCliPath = process.env.npm_execpath;
  if (npmCliPath && fs.existsSync(npmCliPath)) {
    return {
      command: process.execPath,
      args: [npmCliPath, '--prefix', directory, 'run', 'dev'],
      shell: false,
    };
  }

  // Fallback for users who execute `node scripts/dev.js` directly.
  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['--prefix', directory, 'run', 'dev'],
    shell: process.platform === 'win32',
  };
}

function stopProcess(child, signal = 'SIGTERM') {
  if (!child || hasExited(child)) return;

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    });
    killer.on('error', () => {
      try {
        child.kill(signal);
      } catch {
        // The process may already have exited.
      }
    });
    return;
  }

  try {
    // The child is started in its own process group so nodemon/Vite descendants
    // are stopped together when the user presses Ctrl+C.
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function allChildrenExited() {
  return [...children.values()].every(hasExited);
}

function shutdown(code = 0, signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;

  for (const child of children.values()) {
    stopProcess(child, signal);
  }

  const forceTimer = setTimeout(() => {
    for (const child of children.values()) {
      stopProcess(child, 'SIGKILL');
    }
    process.exit(exitCode);
  }, 4000);
  forceTimer.unref();

  if (allChildrenExited()) process.exit(exitCode);
}

function startService(name, directory) {
  const invocation = getNpmInvocation(directory);
  const child = spawn(invocation.command, invocation.args, {
    cwd: projectRoot,
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR || '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: false,
    shell: invocation.shell,
  });

  children.set(name, child);
  prefixOutput(child.stdout, name, process.stdout);
  prefixOutput(child.stderr, name, process.stderr);

  child.on('error', (error) => {
    console.error(`[${name}] Failed to start: ${error.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    const expectedExit = shuttingDown || signal === 'SIGINT' || signal === 'SIGTERM';

    if (!expectedExit) {
      console.error(`[${name}] Exited unexpectedly with code ${code ?? 'unknown'}.`);
      shutdown(code || 1);
      return;
    }

    if (allChildrenExited()) process.exit(exitCode);
  });
}

console.log('Starting Shanthi Electricals backend and frontend...');
startService('backend', 'backend');
startService('frontend', 'frontend');

process.once('SIGINT', () => shutdown(0, 'SIGINT'));
process.once('SIGTERM', () => shutdown(0, 'SIGTERM'));
