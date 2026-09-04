const byId = (id) => document.getElementById(id);
const state = { testing: false, completing: false };

function setResult(message, type = '') {
  const target = byId('connection-result');
  target.textContent = message || '';
  target.className = `inline-result ${type}`.trim();
}
function databasePayload() { return { uri: byId('mongodb-uri').value.trim(), database: byId('database').value.trim() }; }
function adminPayload() {
  return {
    name: byId('admin-name').value.trim(), email: byId('admin-email').value.trim(),
    password: byId('admin-password').value, confirmPassword: byId('admin-confirm-password').value,
    phone: byId('admin-phone').value.trim(),
  };
}
async function testConnection() {
  if (state.testing || state.completing) return;
  state.testing = true;
  byId('test-connection').disabled = true;
  setResult('Connecting...');
  try {
    const result = await window.databaseSetup.testConnection(databasePayload());
    setResult(result.success ? `MongoDB ${result.version} connected with transaction support.` : result.message, result.success ? 'success' : 'error');
  } catch (error) { setResult(error.message || String(error), 'error'); }
  finally { state.testing = false; byId('test-connection').disabled = false; }
}
function validateForm() {
  const database = databasePayload();
  const admin = adminPayload();
  if (!/^mongodb(?:\+srv)?:\/\//i.test(database.uri)) throw new Error('Enter a valid MongoDB connection URI.');
  if (!database.database) throw new Error('Enter the POS database name.');
  if (!admin.name) throw new Error('Enter the POS administrator name.');
  if (!/^\S+@\S+\.\S+$/.test(admin.email)) throw new Error('Enter a valid POS administrator email.');
  if (admin.password.length < 8) throw new Error('The POS administrator password must contain at least 8 characters.');
  if (admin.password !== admin.confirmPassword) throw new Error('The POS administrator passwords do not match.');
  return { database, admin };
}
async function completeSetup() {
  if (state.completing) return;
  let payload;
  try { payload = validateForm(); } catch (error) { setResult(error.message, 'error'); return; }
  state.completing = true;
  byId('complete-setup').disabled = true;
  byId('test-connection').disabled = true;
  byId('progress-overlay').classList.remove('hidden');
  byId('progress-message').textContent = 'Validating MongoDB and creating collections...';
  try {
    const result = await window.databaseSetup.complete(payload);
    if (!result.success) throw new Error(`${result.message || 'Setup failed.'}${result.restartRequired ? ' Restart the application before trying a different database.' : ''}`);
    byId('progress-message').textContent = 'Database ready. Opening the POS...';
  } catch (error) {
    byId('progress-overlay').classList.add('hidden');
    setResult(error.message || String(error), 'error');
    state.completing = false;
    byId('complete-setup').disabled = false;
    byId('test-connection').disabled = false;
  }
}
document.querySelectorAll('[data-toggle-password]').forEach((button) => button.addEventListener('click', () => {
  const target = byId(button.dataset.togglePassword);
  const showing = target.type === 'text';
  target.type = showing ? 'password' : 'text';
  button.textContent = showing ? 'Show' : 'Hide';
}));
byId('test-connection').addEventListener('click', testConnection);
byId('complete-setup').addEventListener('click', completeSetup);
const startupMessage = new URLSearchParams(window.location.search).get('message');
if (startupMessage) { byId('startup-message').textContent = startupMessage; byId('startup-message').classList.remove('hidden'); }
