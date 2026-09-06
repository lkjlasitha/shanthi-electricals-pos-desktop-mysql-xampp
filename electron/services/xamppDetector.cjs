const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function candidateXamppDirectories(env = process.env) {
  const systemDrive = String(env.SystemDrive || env.SYSTEMDRIVE || 'C:').replace(/[\\/]+$/, '');
  const drives = unique([systemDrive, 'C:', 'D:', 'E:', 'F:']);
  const direct = drives.map((drive) => `${drive}\\xampp`);
  const programFiles = unique([env.ProgramFiles, env['ProgramFiles(x86)']]).map((base) =>
    path.join(base, 'xampp')
  );
  return unique([...direct, ...programFiles]);
}

function readMysqlPortFromIni(iniPath) {
  try {
    const content = fs.readFileSync(iniPath, 'utf8');
    let section = '';
    const ports = {};
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;
      const sectionMatch = line.match(/^\[([^\]]+)]$/);
      if (sectionMatch) {
        section = sectionMatch[1].toLowerCase();
        continue;
      }
      if (!['mysqld', 'client', 'mysql'].includes(section)) continue;
      const portMatch = line.match(/^port\s*=\s*(\d+)\s*$/i);
      if (!portMatch) continue;
      const port = Number(portMatch[1]);
      if (port >= 1 && port <= 65535 && !ports[section]) ports[section] = port;
    }
    return ports.mysqld || ports.client || ports.mysql || null;
  } catch {
    // Missing or unreadable my.ini is not fatal.
    return null;
  }
}

function findXamppInstallations(env = process.env) {
  const found = [];
  for (const directory of candidateXamppDirectories(env)) {
    const controlPanel = path.join(directory, 'xampp-control.exe');
    if (!fs.existsSync(controlPanel)) continue;
    const iniCandidates = [
      path.join(directory, 'mysql', 'bin', 'my.ini'),
      path.join(directory, 'mysql', 'my.ini'),
    ];
    const iniPath = iniCandidates.find((candidate) => fs.existsSync(candidate)) || null;
    found.push({
      directory,
      controlPanel,
      mysqlExecutable: path.join(directory, 'mysql', 'bin', 'mysqld.exe'),
      iniPath,
      configuredPort: iniPath ? readMysqlPortFromIni(iniPath) : null,
    });
  }
  return found;
}

function checkTcpPort(host, port, timeout = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let completed = false;
    const finish = (available) => {
      if (completed) return;
      completed = true;
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function detectXamppAndLocalMysql() {
  const installations = findXamppInstallations();
  const ports = unique([
    ...installations.map((item) => item.configuredPort),
    3306,
    3307,
  ]).filter((port) => Number.isInteger(port));

  const portChecks = [];
  for (const port of ports) {
    portChecks.push({ port, available: await checkTcpPort('127.0.0.1', port) });
  }

  const running = portChecks.find((item) => item.available) || null;
  return {
    xamppFound: installations.length > 0,
    installations,
    mysqlRunning: Boolean(running),
    host: '127.0.0.1',
    port: running?.port || installations[0]?.configuredPort || 3306,
    checkedPorts: portChecks,
  };
}

module.exports = {
  candidateXamppDirectories,
  readMysqlPortFromIni,
  findXamppInstallations,
  checkTcpPort,
  detectXamppAndLocalMysql,
};
