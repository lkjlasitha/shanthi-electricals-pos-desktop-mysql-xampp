const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  Menu,
} = require('electron');

const {
  saveDatabaseConfig,
  loadDatabaseConfig,
  getPublicDatabaseConfig,
  deleteDatabaseConfig,
} = require('./services/databaseConfig.cjs');
const { applyDatabaseConfig } = require('./services/applyDatabaseConfig.cjs');
const {
  testServerConnection,
  provisionDatabase,
} = require('./services/mysqlSetup.cjs');
const {
  detectXamppAndLocalMysql,
  findXamppInstallations,
} = require('./services/xamppDetector.cjs');
const { installFileLogger } = require('./services/logger.cjs');

if (require('electron-squirrel-startup')) app.quit();

app.setName('Shanthi Electricals POS');

let mainWindow = null;
let setupWindow = null;
let printWindow = null;
let localServer = null;
let fileLogger = null;
let setupInProgress = false;
let shutdownStarted = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function appPaths() {
  const userData = app.getPath('userData');
  return {
    userData,
    dataDirectory: path.join(userData, 'app-data'),
    backupDirectory: path.join(userData, 'app-data', 'backups'),
    logDirectory: path.join(userData, 'logs'),
    frontendDirectory: path.join(app.getAppPath(), 'frontend', 'dist'),
    icon: path.join(app.getAppPath(), 'resources', 'icon.png'),
  };
}

function ensureAppDirectories() {
  const paths = appPaths();
  fs.mkdirSync(paths.dataDirectory, { recursive: true });
  fs.mkdirSync(paths.backupDirectory, { recursive: true });
  fs.mkdirSync(paths.logDirectory, { recursive: true });
  return paths;
}

function validateBootstrapAdmin(admin = {}) {
  const normalized = {
    name: String(admin.name || '').trim(),
    email: String(admin.email || '').trim().toLowerCase(),
    password: String(admin.password || ''),
    phone: String(admin.phone || '').trim(),
  };

  if (!normalized.name) throw new Error('Administrator name is required.');
  if (!/^\S+@\S+\.\S+$/.test(normalized.email)) {
    throw new Error('Enter a valid administrator email address.');
  }
  if (normalized.password.length < 8) {
    throw new Error('Administrator password must contain at least 8 characters.');
  }
  if (normalized.password !== String(admin.confirmPassword || '')) {
    throw new Error('Administrator password confirmation does not match.');
  }
  return normalized;
}

function secureWindowOptions(preload, extra = {}) {
  return {
    show: false,
    icon: appPaths().icon,
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: process.env.NODE_ENV !== 'production',
    },
    ...extra,
  };
}

function protectNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const allowedPrefix = mainWindow === window ? 'http://127.0.0.1:' : 'file://';
    if (!url.startsWith(allowedPrefix)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
}

async function createMainWindow(port) {
  mainWindow = new BrowserWindow(
    secureWindowOptions(path.join(__dirname, 'preload.cjs'), {
      width: 1440,
      height: 900,
      minWidth: 1100,
      minHeight: 700,
      title: 'Shanthi Electricals POS',
    })
  );

  protectNavigation(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('focus', () => {
    // Re-focus Chromium after native dialogs or Windows task switching.
    // Without this, mouse-driven buttons may work while inputs receive no keys.
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.focus();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

async function startPOS(config, bootstrapAdmin) {
  const paths = ensureAppDirectories();
  if (!fs.existsSync(path.join(paths.frontendDirectory, 'index.html'))) {
    throw new Error(
      'The React production build is missing. Run "npm run build" before starting or packaging the desktop app.'
    );
  }

  applyDatabaseConfig(config, { dataDirectory: paths.dataDirectory });

  const { startDesktopServer } = require(
    path.join(app.getAppPath(), 'backend', 'src', 'startDesktopServer.js')
  );

  localServer = await startDesktopServer({
    frontendDirectory: paths.frontendDirectory,
    bootstrapAdmin,
  });

  await createMainWindow(localServer.port);
}

async function createSetupWindow({ message = '' } = {}) {
  if (setupWindow) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow(
    secureWindowOptions(path.join(__dirname, 'setupPreload.cjs'), {
      width: 920,
      height: 820,
      minWidth: 820,
      minHeight: 720,
      resizable: true,
      title: 'Shanthi Electricals POS Setup',
    })
  );

  protectNavigation(setupWindow);
  setupWindow.once('ready-to-show', () => setupWindow?.show());
  setupWindow.on('closed', () => {
    setupWindow = null;
    if (!mainWindow && !setupInProgress) app.quit();
  });

  await setupWindow.loadFile(path.join(__dirname, 'setup', 'index.html'), {
    query: message ? { message } : undefined,
  });
}

async function showStartupFailure(error) {
  console.error('Desktop startup failed:', error);
  const response = await dialog.showMessageBox({
    type: 'error',
    title: 'Database Connection Failed',
    message: 'Shanthi Electricals POS could not connect to its MySQL database.',
    detail: error?.message || String(error),
    buttons: ['Configure Database', 'Close'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (localServer) {
    try {
      await localServer.close();
    } catch {
      // The application is already failing to start; continue to recovery.
    }
    localServer = null;
  }
  if (response.response === 0) {
    deleteDatabaseConfig();
    app.relaunch();
  }
  app.exit(0);
}

async function printHtml(payload = {}) {
  const html = String(payload.html || '');
  if (!html || html.length > 5_000_000) throw new Error('Printable HTML is missing or too large.');

  if (printWindow) {
    printWindow.destroy();
    printWindow = null;
  }

  printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const temporaryFile = path.join(
    app.getPath('temp'),
    `shanthi-pos-print-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.html`
  );

  try {
    fs.writeFileSync(temporaryFile, html, 'utf8');
    await printWindow.loadFile(temporaryFile);
    await new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: Boolean(payload.silent),
          printBackground: true,
          deviceName: payload.deviceName ? String(payload.deviceName) : undefined,
          margins: payload.noMargins ? { marginType: 'none' } : undefined,
          landscape: Boolean(payload.landscape),
          copies: Math.max(1, Number(payload.copies || 1)),
        },
        (success, failureReason) => {
          if (success) resolve();
          else reject(new Error(failureReason || 'Printing was cancelled or failed.'));
        }
      );
    });
    return { success: true };
  } finally {
    if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
    printWindow = null;
    try {
      if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    } catch {
      // Temporary print files are best-effort cleanup only.
    }
  }
}

function registerIpcHandlers() {
  ipcMain.on('desktop:ensure-keyboard-focus', (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) return;
    if (targetWindow.isMinimized()) targetWindow.restore();
    targetWindow.focus();
    event.sender.focus();
  });

  ipcMain.handle('desktop:get-info', async () => ({
    version: app.getVersion(),
    platform: process.platform,
    database: getPublicDatabaseConfig(),
  }));

  ipcMain.handle('desktop:open-data-folder', async () => {
    const error = await shell.openPath(ensureAppDirectories().dataDirectory);
    if (error) throw new Error(error);
    return { success: true };
  });

  ipcMain.handle('desktop:open-backup-folder', async () => {
    const error = await shell.openPath(ensureAppDirectories().backupDirectory);
    if (error) throw new Error(error);
    return { success: true };
  });

  ipcMain.handle('desktop:get-printers', async () => {
    if (!mainWindow) return [];
    return mainWindow.webContents.getPrintersAsync();
  });

  ipcMain.handle('desktop:print-html', async (_event, payload) => printHtml(payload));

  ipcMain.handle('desktop:reset-database', async () => {
    const response = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'warning',
      title: 'Change Database Connection',
      message: 'Reconfigure the MySQL connection for this Windows user?',
      detail: 'The POS will close and reopen the first-run database setup. Existing MySQL data is not deleted.',
      buttons: ['Cancel', 'Reconfigure'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (response.response !== 1) return { success: false, cancelled: true };
    deleteDatabaseConfig();
    setTimeout(() => {
      app.relaunch();
      app.quit();
    }, 100);
    return { success: true };
  });

  ipcMain.handle('database:detect-xampp', async () => detectXamppAndLocalMysql());

  ipcMain.handle('database:open-xampp', async (_event, requestedPath) => {
    const installations = findXamppInstallations();
    const selected = installations.find((item) => item.controlPanel === requestedPath) || installations[0];
    if (!selected) throw new Error('XAMPP was not found in a supported location.');
    const error = await shell.openPath(selected.controlPanel);
    if (error) throw new Error(error);
    return { success: true };
  });

  ipcMain.handle('database:test', async (_event, input) => {
    try {
      return await testServerConnection(input || {});
    } catch (error) {
      return { success: false, message: error.message, code: error.code || null };
    }
  });

  ipcMain.handle('database:complete', async (_event, payload = {}) => {
    if (setupInProgress) return { success: false, message: 'Setup is already running.' };
    setupInProgress = true;

    try {
      const admin = validateBootstrapAdmin(payload.admin);
      const provisioned = await provisionDatabase(payload.database);

      await startPOS(provisioned.appConfig, admin);
      saveDatabaseConfig(provisioned.appConfig);

      setTimeout(() => {
        if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
      }, 150);

      return {
        success: true,
        server: provisioned.server,
        database: provisioned.appConfig.database,
        applicationUser: provisioned.appConfig.username,
        dedicatedUserCreated: provisioned.dedicatedUserCreated,
      };
    } catch (error) {
      console.error('Database setup failed:', error);
      return {
        success: false,
        message: error?.message || String(error),
        code: error?.code || null,
        restartRequired: Boolean(localServer || mainWindow),
      };
    } finally {
      setupInProgress = false;
    }
  });
}

app.on('second-instance', () => {
  const target = mainWindow || setupWindow;
  if (!target) return;
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
});

app.whenReady().then(async () => {
  app.setAppUserModelId('com.shanthi.electricals.pos');
  const paths = ensureAppDirectories();
  fileLogger = installFileLogger(paths.logDirectory);
  registerIpcHandlers();
  Menu.setApplicationMenu(null);

  try {
    const config = loadDatabaseConfig();
    if (!config) {
      await createSetupWindow();
      return;
    }
    await startPOS(config);
  } catch (error) {
    await showStartupFailure(error);
  }
});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
  else if (setupWindow) setupWindow.show();
});

app.on('before-quit', (event) => {
  if (localServer && !shutdownStarted) {
    event.preventDefault();
    shutdownStarted = true;
    const server = localServer;
    localServer = null;
    server.close()
      .catch((error) => console.error('Failed to close desktop backend cleanly:', error))
      .finally(() => {
        fileLogger?.close();
        app.quit();
      });
    return;
  }
  fileLogger?.close();
});

app.on('window-all-closed', () => app.quit());
