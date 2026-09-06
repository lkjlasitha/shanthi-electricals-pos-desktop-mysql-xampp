# Windows startup fix

This revision fixes two separate startup problems.

## 1. `Error: spawn EINVAL`

The root development runner no longer launches `npm.cmd` directly. It executes the active npm CLI with the current Node executable, which is compatible with Windows, macOS, and Linux.

Run both applications from the root directory:

```powershell
npm run dev
```

Press Ctrl+C once to stop both processes.

## 2. `ECONNREFUSED 127.0.0.1:3306`

This means MySQL/MariaDB is not running or is not listening on port 3306.

Check for a Windows service:

```powershell
Get-Service *mysql*, *maria*
```

Start the service using the name shown by that command, for example:

```powershell
Start-Service MySQL80
```

For XAMPP/WAMP, start MySQL from its control panel.

Then verify the connection and seed the project:

```powershell
npm run db:check
npm run seed
npm run dev
```

The configured database is created automatically in development when the MySQL user has `CREATE DATABASE` permission.
