# Shanthi Electricals POS Desktop — MySQL/XAMPP Installation

This build keeps **MySQL/MariaDB** as the only database engine. The Electron installer contains the React user interface, Express API, Node.js runtime and Chromium desktop shell. It does **not** bundle a MySQL server.

A target computer must have one of these:

1. XAMPP with its MySQL/MariaDB module running.
2. Standalone MySQL Server or MariaDB Server running locally.
3. Network access to a MySQL/MariaDB server on another computer.

A username and password connect to a running database server; credentials do not replace the server.

## First-run workflow

On first launch, the app opens a database setup window before loading Sequelize or any backend model.

### XAMPP mode

The setup scans common Windows locations such as `C:\xampp`, `D:\xampp`, and `E:\xampp`, reads the configured port from XAMPP's `my.ini` when available, and checks common local ports.

1. Open XAMPP Control Panel.
2. Start **MySQL**.
3. Select **Use XAMPP** in the POS setup.
4. Confirm host `127.0.0.1`, port, MySQL administrator username and password.
5. Test the connection.
6. Enter the first POS administrator account.
7. Select **Create and open POS**.

A blank XAMPP root password is supported, but the app never assumes it must be blank.

### Standalone or network MySQL mode

Select **Use MySQL Server** and enter:

- Host or IP address
- Port, normally `3306`
- MySQL administrator or provisioning account
- MySQL password
- Database name, normally `electro_pos`

For a central database, use the server's LAN address, for example `192.168.1.20`. Configure Windows Firewall, MySQL `bind-address`, and MySQL user host permissions on that server.

## Database account options

The recommended setup option is **Create a dedicated POS database user**.

The supplied administrator account is used once to:

- Create the database when requested
- Create a randomly named POS database account
- Grant only the permissions needed by the application
- Verify the new account

The administrator password is then discarded. The generated application password and JWT secret are encrypted with Electron `safeStorage` and saved under the current Windows user's application data directory.

The alternative **Use the supplied MySQL account** stores that account for normal POS operation. Use it when a database administrator has already created a dedicated account. Avoid storing a remote `root` account unless there is no safer option.

## Windows data locations

The installed program is read-only. Mutable data is stored outside `Program Files`:

```text
%APPDATA%\Shanthi Electricals POS\
├── config\database.json       encrypted connection configuration
├── app-data\backups\         automatic pre-restore Excel backups
└── logs\desktop.log           desktop/backend startup log
```

The MySQL business data remains in the configured MySQL/MariaDB server.

## Initial POS administrator

The setup asks for a POS name, email and password. These are separate from MySQL credentials. The account is created only when the selected database contains no POS users.

The first launch also creates missing roles, the default warehouse, LKR currency, units, starter electrical-shop categories and brands, and document settings. Existing data is retained because initialization uses `findOrCreate` and additive migrations.

## Development setup

Install Node.js and npm on the development computer, then run from the project root:

```powershell
npm install
npm run verify
npm run desktop:start
```

`desktop:start` builds the React production bundle and starts Electron. The first run shows the same database setup used by the installed application.

Browser development remains available:

```powershell
copy backend\.env.example backend\.env
npm run dev
```

## Build the Windows installer

Build on Windows for the simplest Squirrel.Windows workflow:

```powershell
npm install
npm run desktop:make:win
```

Expected output:

```text
out\make\squirrel.windows\x64\
├── Shanthi Electricals POS Setup.exe
├── shanthi_electricals_pos-<version>-full.nupkg
└── RELEASES
```

Distribute `Shanthi Electricals POS Setup.exe`. The target computer does not require Node.js, npm, source code or VS Code. It still requires local XAMPP/MySQL or network access to a MySQL server.

Squirrel.Windows builds on Windows directly. Building it on Linux additionally requires Wine and Mono.

## Optional Windows code signing

Set these environment variables before `npm run desktop:make:win`:

```powershell
$env:WINDOWS_CERTIFICATE_FILE = "C:\secure\shanthi-signing.pfx"
$env:WINDOWS_CERTIFICATE_PASSWORD = "your-certificate-password"
npm run desktop:make:win
```

Never commit the certificate or password.

## Printing

In **Settings → Desktop application**:

1. Choose the exact Windows thermal-printer name.
2. Save the printer setting.
3. Test receipt printing with silent mode disabled.
4. Enable silent receipt printing only after paper size and margins are correct.

A4 documents continue to show the normal Windows print dialog. Standard USB barcode scanners in HID keyboard mode continue to work without a special Electron driver.

## Backup and migration

Before moving an existing shop installation:

1. Open **Settings → Full Excel backup** in the old system.
2. Save the `.xlsx` file securely.
3. Install and configure the desktop app.
4. Open **Settings → Restore from Excel backup**.
5. Type `RESTORE` and import the workbook.
6. Validate products, stock, sales, purchases, users and settings.

The desktop app writes an automatic pre-restore safety workbook to the app-data backup folder.

## Reconfigure the database

Open **Settings → Desktop application → Change Database**. The app removes only the encrypted local connection file and restarts the first-run setup. It does not delete the MySQL database.

When the app cannot connect during startup, it also offers **Configure Database**. Connection details and startup errors are recorded in `logs\desktop.log`.

## Clean-computer acceptance test

Test the generated installer on a Windows 10/11 machine or VM with no Node.js and no project files.

- Install and launch from Start menu.
- Test XAMPP detection with MySQL stopped and started.
- Test incorrect and correct MySQL credentials.
- Create a fresh database and first POS administrator.
- Restart Windows and confirm data remains.
- Create products and variants, purchase stock, complete a sale and return.
- Print an A4 document and an 80 mm receipt.
- Export and restore an Excel backup.
- Install a newer application version over the old version and confirm the MySQL data is unchanged.
