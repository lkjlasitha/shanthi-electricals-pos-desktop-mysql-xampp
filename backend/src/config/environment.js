const fs = require('node:fs');
const dns = require('node:dns');
const net = require('node:net');
const path = require('node:path');
const dotenv = require('dotenv');

const backendEnvPath = path.resolve(__dirname, '../../.env');
const projectEnvPath = path.resolve(__dirname, '../../../.env');
const initialEnvironment = new Set(Object.keys(process.env));

function readEnvironmentFile(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, parsed: {}, warnings: [] };
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = dotenv.parse(text);
  const warnings = [];
  const assignment = text.split(/\r?\n/).find((line) => /^\s*(?:export\s+)?MONGODB_URI\s*=/.test(line));
  if (assignment) {
    const rawValue = assignment.slice(assignment.indexOf('=') + 1).trim();
    if (rawValue && !/^['"]/.test(rawValue) && rawValue.includes('#')) {
      warnings.push('MONGODB_URI contains an unquoted #. dotenv treats it as a comment; quote the value and percent-encode # in credentials as %23.');
    }
  }
  return { exists: true, parsed, warnings };
}

const backendFile = readEnvironmentFile(backendEnvPath);
const projectFile = readEnvironmentFile(projectEnvPath);

// Precedence is: an already-set OS/Electron variable, backend/.env, root .env,
// then the local-development default. Absolute paths keep this independent of cwd.
dotenv.config({ path: backendEnvPath, override: false, quiet: true });
dotenv.config({ path: projectEnvPath, override: false, quiet: true });

function parseMongoDnsServers(value) {
  const servers = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!servers.length) return [];
  const invalid = servers.find((server) => net.isIP(server) === 0);
  if (invalid) throw new Error(`MONGODB_DNS_SERVERS contains an invalid IP address: ${invalid}`);
  return [...new Set(servers)];
}

let configuredMongoDnsServers = [];
let dnsConfigurationError = null;
try {
  configuredMongoDnsServers = parseMongoDnsServers(process.env.MONGODB_DNS_SERVERS);
  if (configuredMongoDnsServers.length) dns.setServers(configuredMongoDnsServers);
} catch (error) {
  dnsConfigurationError = error;
  dnsConfigurationError.code = 'POS_MONGO_CONFIG';
}

function selectEnvironmentSource(key, initialKeys, backendParsed, projectParsed) {
  if (initialKeys.has(key)) return 'process environment';
  if (Object.prototype.hasOwnProperty.call(backendParsed, key)) return 'backend/.env';
  if (Object.prototype.hasOwnProperty.call(projectParsed, key)) return 'project-root .env';
  return 'built-in local default';
}

function sourceFor(key) {
  return selectEnvironmentSource(key, initialEnvironment, backendFile.parsed, projectFile.parsed);
}

function environmentWarnings() {
  const warnings = [...backendFile.warnings, ...projectFile.warnings];
  const backendUri = backendFile.parsed.MONGODB_URI;
  const projectUri = projectFile.parsed.MONGODB_URI;
  if (!initialEnvironment.has('MONGODB_URI') && backendUri && projectUri && backendUri !== projectUri) {
    warnings.push('Both backend/.env and the project-root .env define different MONGODB_URI values; backend/.env takes precedence.');
  }
  if (configuredMongoDnsServers.length) {
    warnings.push(`Node MongoDB DNS override enabled: ${configuredMongoDnsServers.join(', ')}.`);
  }
  return [...new Set(warnings)];
}

module.exports = {
  backendEnvPath,
  projectEnvPath,
  sourceFor,
  environmentWarnings,
  configuredMongoDnsServers,
  dnsConfigurationError,
  parseMongoDnsServers,
  readEnvironmentFile,
  selectEnvironmentSource,
};
