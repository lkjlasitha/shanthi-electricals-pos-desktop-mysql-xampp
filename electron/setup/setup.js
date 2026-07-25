const byId = (id) => document.getElementById(id);
const state = { xampp: null, testing: false, completing: false };

function selectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function setResult(message, type = '') {
  const target = byId('connection-result');
  target.textContent = message || '';
  target.className = `inline-result ${type}`.trim();
}

function databasePayload() {
  return {
    mode: selectedValue('mode'),
    host: byId('host').value.trim(),
    port: Number(byId('port').value),
    adminUsername: byId('db-username').value.trim(),
    adminPassword: byId('db-password').value,
    database: byId('database').value.trim(),
    createDatabase: byId('create-database').checked,
    credentialMode: selectedValue('credential-mode'),
  };
}

function adminPayload() {
  return {
    name: byId('admin-name').value.trim(),
    email: byId('admin-email').value.trim(),
    password: byId('admin-password').value,
    confirmPassword: byId('admin-confirm-password').value,
    phone: byId('admin-phone').value.trim(),
  };
}

function updateModeCards() {
  const mode = selectedValue('mode');
  document.querySelectorAll('[data-mode-card]').forEach((card) => {
    card.classList.toggle('selected', card.dataset.modeCard === mode);
  });

  if (mode === 'xampp') {
    byId('host').value = '127.0.0.1';
    if (state.xampp?.port) byId('port').value = state.xampp.port;
    if (!byId('db-username').value.trim()) byId('db-username').value = 'root';
  }
}

async function detectXampp() {
  const box = byId('xampp-status');
  const detail = byId('xampp-status-detail');
  const openButton = byId('open-xampp');

  try {
    const result = await window.databaseSetup.detectXampp();
    state.xampp = result;
    box.className = 'status-box';

    if (result.xamppFound && result.mysqlRunning) {
      box.classList.add('success');
      box.querySelector('strong').textContent = 'XAMPP and local MySQL/MariaDB detected';
      detail.textContent = `A database server is accepting connections on 127.0.0.1:${result.port}.`;
      byId('port').value = result.port;
    } else if (result.xamppFound) {
      box.classList.add('warning');
      box.querySelector('strong').textContent = 'XAMPP found, but MySQL is not running';
      detail.textContent = 'Open XAMPP Control Panel, start MySQL, and then test the connection.';
    } else if (result.mysqlRunning) {
      box.classList.add('success');
      box.querySelector('strong').textContent = 'A local MySQL/MariaDB server is running';
      detail.textContent = `The server is accepting connections on 127.0.0.1:${result.port}.`;
      byId('port').value = result.port;
    } else {
      box.classList.add('warning');
      box.querySelector('strong').textContent = 'XAMPP was not detected';
      detail.textContent = 'Install/start XAMPP, or choose MySQL Server and enter another server address.';
    }

    if (result.installations?.length) {
      openButton.classList.remove('hidden');
      openButton.dataset.path = result.installations[0].controlPanel;
    }
  } catch (error) {
    box.className = 'status-box error';
    box.querySelector('strong').textContent = 'XAMPP detection failed';
    detail.textContent = error.message || String(error);
  }
}

async function testConnection() {
  if (state.testing || state.completing) return;
  state.testing = true;
  const button = byId('test-connection');
  button.disabled = true;
  setResult('Connecting...');

  try {
    const result = await window.databaseSetup.testConnection({
      host: byId('host').value.trim(),
      port: Number(byId('port').value),
      username: byId('db-username').value.trim(),
      password: byId('db-password').value,
    });

    if (result.success) {
      setResult(`${result.engine} ${result.version} connected successfully.`, 'success');
    } else {
      setResult(result.message || 'Connection failed.', 'error');
    }
  } catch (error) {
    setResult(error.message || String(error), 'error');
  } finally {
    state.testing = false;
    button.disabled = false;
  }
}

function validateForm() {
  const db = databasePayload();
  const admin = adminPayload();
  if (!db.host) throw new Error('Enter the MySQL host or IP address.');
  if (!db.adminUsername) throw new Error('Enter the MySQL username.');
  if (!db.database) throw new Error('Enter the POS database name.');
  if (!admin.name) throw new Error('Enter the POS administrator name.');
  if (!/^\S+@\S+\.\S+$/.test(admin.email)) throw new Error('Enter a valid POS administrator email.');
  if (admin.password.length < 8) throw new Error('The POS administrator password must contain at least 8 characters.');
  if (admin.password !== admin.confirmPassword) throw new Error('The POS administrator passwords do not match.');
  return { database: db, admin };
}

async function completeSetup() {
  if (state.completing) return;
  let payload;
  try {
    payload = validateForm();
  } catch (error) {
    setResult(error.message, 'error');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    return;
  }

  state.completing = true;
  byId('complete-setup').disabled = true;
  byId('test-connection').disabled = true;
  byId('progress-overlay').classList.remove('hidden');
  byId('progress-message').textContent = 'Creating or validating the MySQL database...';

  try {
    const result = await window.databaseSetup.complete(payload);
    if (!result.success) {
      throw new Error(
        `${result.message || 'Setup failed.'}${result.restartRequired ? ' Restart the application before trying a different database configuration.' : ''}`
      );
    }
    byId('progress-message').textContent = 'Database ready. Opening the POS...';
  } catch (error) {
    byId('progress-overlay').classList.add('hidden');
    setResult(error.message || String(error), 'error');
    state.completing = false;
    byId('complete-setup').disabled = false;
    byId('test-connection').disabled = false;
  }
}

function initializePasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = byId(button.dataset.togglePassword);
      const showing = target.type === 'text';
      target.type = showing ? 'password' : 'text';
      button.textContent = showing ? 'Show' : 'Hide';
    });
  });
}

document.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener('change', updateModeCards);
});
byId('test-connection').addEventListener('click', testConnection);
byId('complete-setup').addEventListener('click', completeSetup);
byId('open-xampp').addEventListener('click', async () => {
  try {
    await window.databaseSetup.openXampp(byId('open-xampp').dataset.path || '');
  } catch (error) {
    setResult(error.message || String(error), 'error');
  }
});

const startupMessage = new URLSearchParams(window.location.search).get('message');
if (startupMessage) {
  byId('startup-message').textContent = startupMessage;
  byId('startup-message').classList.remove('hidden');
}

initializePasswordToggles();
updateModeCards();
detectXampp();
