const { asyncHandler } = require('../utils/helpers');
const { backupBuffer, restoreBackup } = require('../services/backupService');
const HttpError = require('../utils/httpError');
const { todayISO } = require('../utils/date');

const exportBackup = asyncHandler(async (req, res) => {
  const { buffer, tables } = await backupBuffer();
  const date = todayISO();
  const filename = `shanthi-electricals-full-backup-${date}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('X-Backup-Table-Count', String(tables.length));
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
});

const importBackup = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ message: 'Choose an .xlsx backup file.' });
  if (req.body.confirm !== 'RESTORE') {
    return res.status(422).json({ message: 'Restore confirmation is required. Type RESTORE before importing.' });
  }
  let result;
  try {
    result = await restoreBackup(req.file.buffer);
  } catch (error) {
    throw new HttpError(422, error.message || 'The backup could not be restored.');
  }
  res.json({
    message: 'Backup restored successfully. Sign in again if your user account changed.',
    data: {
      ...result,
      safetyBackup: result.safetyBackup ? { filename: result.safetyBackup.filename } : null,
    },
  });
});

module.exports = { exportBackup, importBackup };
