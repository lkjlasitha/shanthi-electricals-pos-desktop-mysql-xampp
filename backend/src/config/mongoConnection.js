const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/electro_pos';

function configurationError(message) {
  const error = new Error(message);
  error.code = 'POS_MONGO_CONFIG';
  return error;
}

function parseMongoUri(uriValue) {
  const uri = String(uriValue || '').trim();
  if (!uri) throw configurationError('MongoDB URI (MONGODB_URI) is empty.');
  const scheme = uri.match(/^(mongodb(?:\+srv)?):\/\//i)?.[1]?.toLowerCase();
  if (!scheme) throw configurationError('MongoDB URI (MONGODB_URI) must begin with mongodb:// or mongodb+srv://.');
  if (/\s/.test(uri)) throw configurationError('MongoDB URI (MONGODB_URI) contains whitespace. Quote the value in .env and remove spaces from the URI.');
  if (/[<>]/.test(uri)) throw configurationError('MongoDB URI (MONGODB_URI) still contains a placeholder such as <password>. Replace every placeholder with its real, percent-encoded value.');

  const remainder = uri.slice(scheme.length + 3);
  const slash = remainder.indexOf('/');
  const authority = slash === -1 ? remainder.split('?')[0] : remainder.slice(0, slash);
  const hosts = authority.slice(authority.lastIndexOf('@') + 1);
  if (!hosts || !/[a-z0-9\[]/i.test(hosts)) throw configurationError('MongoDB URI (MONGODB_URI) does not contain a valid host.');
  if (scheme === 'mongodb+srv' && (hosts.includes(',') || /:\d+$/.test(hosts))) {
    throw configurationError('A mongodb+srv:// URI must contain one DNS hostname and must not specify a port.');
  }

  const pathAndQuery = slash === -1 ? '' : remainder.slice(slash + 1);
  const encodedDatabase = pathAndQuery.split('?')[0];
  let database = 'electro_pos';
  if (encodedDatabase) {
    try { database = decodeURIComponent(encodedDatabase); }
    catch { throw configurationError('The database name in MONGODB_URI contains invalid percent encoding.'); }
  }
  if (database.includes('/')) throw configurationError('MONGODB_URI contains an invalid database name.');
  return { uri, scheme, hosts, database };
}

function publicMongoTarget(uriValue) {
  try {
    const { scheme, hosts, database } = parseMongoUri(uriValue);
    return `${scheme}://${hosts}/${database}`;
  } catch {
    return 'configured MongoDB server';
  }
}

function redactSecrets(value) {
  let text = String(value || '');
  text = text.replace(/mongodb(?:\+srv)?:\/\/[^\s'"<>]+/gi, (uri) => {
    const firstAuthorityCharacter = uri[uri.indexOf('://') + 3];
    if (!/[a-z0-9\[]/i.test(firstAuthorityCharacter || '')) return uri;
    try { return publicMongoTarget(uri); } catch { return 'mongodb://<redacted>'; }
  });
  text = text.replace(/((?:password|passwd|pwd|token|secret)\s*[=:]\s*)[^\s,;]+/gi, '$1<redacted>');
  return text;
}

function collectMongoErrorMessages(error, messages = [], seen = new Set()) {
  if (!error || (typeof error !== 'object' && typeof error !== 'string') || seen.has(error)) return messages;
  if (typeof error === 'string') { messages.push(error); return messages; }
  seen.add(error);
  if (error.message) messages.push(error.message);
  if (error.cause) collectMongoErrorMessages(error.cause, messages, seen);
  if (error.reason) collectMongoErrorMessages(error.reason, messages, seen);
  const servers = error.servers || error.reason?.servers;
  if (servers instanceof Map) {
    for (const description of servers.values()) collectMongoErrorMessages(description?.error, messages, seen);
  }
  return messages;
}

function technicalDetail(error) {
  const messages = collectMongoErrorMessages(error).map(redactSecrets).filter(Boolean);
  return [...new Set(messages)].slice(0, 3).join(' | ');
}

function formatMongoError(error, uriValue) {
  const detail = technicalDetail(error);
  const searchable = `${error?.name || ''} ${error?.code || ''} ${detail}`;
  const target = publicMongoTarget(uriValue || DEFAULT_MONGODB_URI);
  const suffix = detail ? ` Technical detail: ${detail}` : '';

  if (error?.code === 'POS_MONGO_CONFIG' || /MongoParseError|Invalid connection string/i.test(searchable)) {
    return `Invalid MongoDB configuration: ${detail || error?.message || 'check MONGODB_URI.'}`;
  }
  if (error?.code === 18 || /authentication failed|bad auth|auth failed/i.test(searchable)) {
    return `MongoDB rejected the credentials for ${target}. Verify the database user, password, authSource, and percent-encoding of special characters.${suffix}`;
  }
  if (/querySrv|queryTxt|ENOTFOUND|ENODATA|EAI_AGAIN|DNSHostNotFound/i.test(searchable)) {
    return `MongoDB DNS lookup failed for ${target}. Check the cluster hostname and the Windows/network DNS server.${suffix}`;
  }
  if (/tls|ssl|certificate|self[- ]signed|CERT_|SSL_/i.test(searchable)) {
    return `MongoDB TLS negotiation failed for ${target}. Check the system clock, CA certificate, proxy/antivirus TLS inspection, and URI TLS options.${suffix}`;
  }
  if (/ECONNREFUSED/i.test(searchable)) {
    return `MongoDB refused the connection to ${target}. Confirm the server is running and the host/port is reachable.${suffix}`;
  }
  if (/ETIMEDOUT|timed out|ServerSelectionError/i.test(searchable)) {
    return `MongoDB server selection timed out for ${target}. Check the Atlas network access list/firewall, cluster status, DNS, and TLS settings.${suffix}`;
  }
  return redactSecrets(error?.message || String(error));
}

module.exports = {
  DEFAULT_MONGODB_URI,
  collectMongoErrorMessages,
  formatMongoError,
  parseMongoUri,
  publicMongoTarget,
  redactSecrets,
};
