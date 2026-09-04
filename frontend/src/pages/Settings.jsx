import React, { useEffect, useRef, useState } from 'react';
import { BackupAPI, SettingsAPI } from '../api/endpoints';
import { PageHeader, Card, Field, Button, inputClass } from '../components/ui.jsx';
import { saveResponseBlob } from '../utils/download';
import { getDocumentSettings } from '../components/DocumentActions.jsx';
import { todayISO } from '../utils/format';
import { PRINT_STORAGE_KEYS } from '../utils/printDocuments';
import { useDialog } from '../context/DialogContext.jsx';

const FIELDS = [
  { key: 'business_name', label: 'Business name' },
  { key: 'business_tagline', label: 'Tagline (shown under the business name on documents; one line per line)', textarea: true },
  { key: 'business_phone', label: 'Business phone' },
  { key: 'business_email', label: 'Business email' },
  { key: 'business_address', label: 'Business address', textarea: true },
  { key: 'business_tax_number', label: 'TIN / VAT registration number' },
  { key: 'default_currency', label: 'Default currency code (e.g. LKR)' },
  { key: 'currency_symbol', label: 'Currency symbol (e.g. Rs.)' },
  { key: 'default_tax_rate', label: 'Default VAT/tax rate (%)' },
  { key: 'invoice_prefix', label: 'Invoice reference prefix' },
  { key: 'receipt_footer', label: 'Receipt footer', textarea: true },
  { key: 'quotation_terms', label: 'Default quotation terms', textarea: true },
  { key: 'timezone', label: 'Timezone', readOnly: true },
  { key: 'date_format', label: 'Date format', readOnly: true },
];

const MAX_LOGO_BYTES = 1.5 * 1024 * 1024; // 1.5MB source image cap, before base64 encoding

function readFileAsDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export default function Settings() {
  const { confirm } = useDialog();
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [desktopInfo, setDesktopInfo] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [receiptPrinter, setReceiptPrinter] = useState(() => localStorage.getItem(PRINT_STORAGE_KEYS.receiptPrinter) || '');
  const [silentReceipt, setSilentReceipt] = useState(() => localStorage.getItem(PRINT_STORAGE_KEYS.silentReceipt) === 'true');
  const [logoError, setLogoError] = useState('');
  const fileRef = useRef(null);
  const logoFileRef = useRef(null);

  useEffect(() => {
    SettingsAPI.getAll().then((r) => setValues(r.data.data));
    if (window.shanthiDesktop) {
      Promise.all([window.shanthiDesktop.getInfo(), window.shanthiDesktop.getPrinters()])
        .then(([info, printerRows]) => {
          setDesktopInfo(info);
          setPrinters(Array.isArray(printerRows) ? printerRows : []);
        })
        .catch((desktopError) => setError(desktopError.message || 'Desktop information could not be loaded.'));
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await SettingsAPI.updateMany(values);
      await getDocumentSettings({ refresh: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Settings could not be saved.');
    }
  };

  const exportBackup = async () => {
    setBackupBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await BackupAPI.exportAll();
      const filename = saveResponseBlob(response, `shanthi-electricals-full-backup-${todayISO()}.xlsx`);
      setMessage(`Full backup downloaded: ${filename}`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not create the backup.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoError('');
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      setLogoError('Please choose a PNG or JPG image.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('That image is too large. Please choose one under 1.5MB.');
      return;
    }
    try {
      const dataUri = await readFileAsDataUri(file);
      setValues((previous) => ({ ...previous, business_logo: dataUri }));
    } catch {
      setLogoError('The image could not be read. Please try another file.');
    } finally {
      if (logoFileRef.current) logoFileRef.current.value = '';
    }
  };

  const removeLogo = () => {
    setValues((previous) => ({ ...previous, business_logo: '' }));
  };

  const savePrinterSettings = () => {
    localStorage.setItem(PRINT_STORAGE_KEYS.receiptPrinter, receiptPrinter);
    localStorage.setItem(PRINT_STORAGE_KEYS.silentReceipt, String(silentReceipt));
    setMessage('Desktop receipt printer settings saved.');
    setError('');
  };

  const resetDatabaseConfiguration = async () => {
    setMessage('');
    setError('');
    try {
      await window.shanthiDesktop.resetDatabaseConfiguration();
    } catch (desktopError) {
      setError(desktopError.message || 'The database setup could not be reopened.');
    }
  };

  const openDesktopFolder = async (kind) => {
    setMessage('');
    setError('');
    try {
      if (kind === 'backup') await window.shanthiDesktop.openBackupFolder();
      else await window.shanthiDesktop.openDataFolder();
    } catch (desktopError) {
      setError(desktopError.message || 'The Windows folder could not be opened.');
    }
  };

  const importBackup = async () => {
    setMessage('');
    setError('');
    if (!restoreFile) return setError('Choose a Shanthi Electricals .xlsx backup file.');
    if (restoreConfirmation !== 'RESTORE') return setError('Type RESTORE exactly to confirm the full database replacement.');
    const ok = await confirm(
      'This will replace the current database data with the selected backup. A safety backup will be created on the server first. Continue?',
      { title: 'Restore database', confirmLabel: 'Restore' }
    );
    if (!ok) return;

    setBackupBusy(true);
    try {
      const response = await BackupAPI.importAll(restoreFile, restoreConfirmation);
      const restored = response.data.data?.restored || [];
      const rowCount = restored.reduce((sum, table) => sum + Number(table.rows || 0), 0);
      setMessage(`Restore completed: ${restored.length} tables and ${rowCount} rows. Reloading the application…`);
      setRestoreFile(null);
      setRestoreConfirmation('');
      if (fileRef.current) fileRef.current.value = '';
      window.setTimeout(() => window.location.reload(), 1800);
    } catch (requestError) {
      const blob = requestError.response?.data;
      if (blob instanceof Blob) {
        try {
          const parsed = JSON.parse(await blob.text());
          setError(parsed.message || 'The backup could not be restored.');
        } catch {
          setError('The backup could not be restored.');
        }
      } else {
        setError(requestError.response?.data?.message || 'The backup could not be restored.');
      }
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Shanthi Electricals Settings" subtitle="Business details used on receipts, invoices, quotations, reports and backups." />

      {message && <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-3">{message}</div>}
      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Card className="p-5">
          <h2 className="font-display font-semibold text-lg mb-4">Business and document details</h2>
          <form onSubmit={submit}>
            {saved && <div className="mb-3 text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">Settings saved.</div>}
            <Field label="Business logo" hint="Shown on quotations, invoices and receipts. PNG with a transparent background looks best.">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-md border border-slate-200 bg-slate-50 p-1.5">
                  {values.business_logo
                    ? <img src={values.business_logo} alt="Business logo" className="max-h-full max-w-full object-contain" />
                    : <span className="text-[10px] text-graphite-400">No logo</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <input ref={logoFileRef} type="file" accept="image/png,image/jpeg" className="text-xs" onChange={handleLogoChange} />
                  {values.business_logo && (
                    <button type="button" onClick={removeLogo} className="self-start text-xs text-red-600 hover:underline">Remove logo</button>
                  )}
                </div>
              </div>
              {logoError && <p className="mt-1 text-xs text-red-600">{logoError}</p>}
            </Field>
            {FIELDS.map((field) => (
              <Field key={field.key} label={field.label}>
                {field.textarea ? (
                  <textarea className={inputClass} rows={field.key === 'business_address' ? 2 : 3} disabled={field.readOnly} value={values[field.key] || ''} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
                ) : (
                  <input className={inputClass} disabled={field.readOnly} value={values[field.key] || ''} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
                )}
              </Field>
            ))}
            <Button type="submit">Save Settings</Button>
          </form>
        </Card>

        <div className="space-y-6">
          {desktopInfo && (
            <Card className="p-5">
              <h2 className="font-display font-semibold text-lg">Desktop application</h2>
              <p className="text-sm text-graphite-600 mt-1 mb-4">
                Version {desktopInfo.version}. Database: {desktopInfo.database?.username}@{desktopInfo.database?.host}:{desktopInfo.database?.port}/{desktopInfo.database?.database}
              </p>
              <Field label="Thermal receipt printer" hint="Choose the exact Windows printer name. Normal A4 printing always shows the print dialog.">
                <select className={inputClass} value={receiptPrinter} onChange={(event) => setReceiptPrinter(event.target.value)}>
                  <option value="">Use the Windows default printer</option>
                  {printers.map((printer) => (
                    <option key={printer.name} value={printer.name}>{printer.displayName || printer.name}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-start gap-2 text-sm text-graphite-700 mb-4">
                <input type="checkbox" className="mt-1" checked={silentReceipt} disabled={!receiptPrinter} onChange={(event) => setSilentReceipt(event.target.checked)} />
                <span>Print sales receipts silently to the selected printer. Leave disabled while testing paper size and margins.</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={savePrinterSettings}>Save Printer</Button>
                <Button type="button" variant="secondary" onClick={() => openDesktopFolder('data')}>Open App Data</Button>
                <Button type="button" variant="secondary" onClick={() => openDesktopFolder('backup')}>Open Safety Backups</Button>
                <Button type="button" variant="danger" onClick={resetDatabaseConfiguration}>Change Database</Button>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="font-display font-semibold text-lg">Full Excel backup</h2>
            <p className="text-sm text-graphite-600 mt-1 mb-4">
              Download every database table into one Excel workbook. The workbook includes products, stock, customers, suppliers, sales, quotations, purchases, returns, users, settings and other system data.
            </p>
            <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 mb-4">
              The backup contains confidential business data and password hashes. Store it securely and do not edit worksheet names or the backup metadata sheet.
            </div>
            <Button type="button" onClick={exportBackup} disabled={backupBusy}>
              {backupBusy ? 'Preparing…' : 'Download Full Backup (.xlsx)'}
            </Button>
          </Card>

          <Card className="p-5 border-red-200">
            <h2 className="font-display font-semibold text-lg text-red-800">Restore from Excel backup</h2>
            <p className="text-sm text-graphite-600 mt-1 mb-4">
              Restoring replaces the current table data. The server automatically creates a pre-restore safety backup before changing the database.
            </p>
            <Field label="Backup workbook">
              <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className={inputClass} onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} />
            </Field>
            <Field label="Type RESTORE to confirm" hint="This confirmation prevents accidental imports.">
              <input className={inputClass} value={restoreConfirmation} onChange={(e) => setRestoreConfirmation(e.target.value)} autoComplete="off" />
            </Field>
            <Button type="button" variant="danger" onClick={importBackup} disabled={backupBusy || !restoreFile || restoreConfirmation !== 'RESTORE'}>
              {backupBusy ? 'Restoring…' : 'Restore Full Backup'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
