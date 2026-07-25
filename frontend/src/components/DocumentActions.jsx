import React, { useState } from 'react';
import { DocumentsAPI, SettingsAPI } from '../api/endpoints';
import { saveResponseBlob } from '../utils/download';
import { printTransaction } from '../utils/printDocuments';
import { Button } from './ui.jsx';

let settingsCache = null;
let settingsPromise = null;

export async function getDocumentSettings({ refresh = false } = {}) {
  if (refresh) {
    settingsCache = null;
    settingsPromise = null;
  }
  if (settingsCache) return settingsCache;
  if (!settingsPromise) {
    settingsPromise = SettingsAPI.getAll().then((response) => {
      settingsCache = response.data.data || {};
      return settingsCache;
    }).finally(() => { settingsPromise = null; });
  }
  return settingsPromise;
}

export async function downloadDocumentPdf(type, record, format = 'a4') {
  const response = await DocumentsAPI.pdf(type, record.id, format);
  const reference = record.reference_code || record.id;
  const prefix = format === 'receipt' ? 'receipt' : type;
  return saveResponseBlob(response, `${prefix}-${reference}.pdf`);
}

async function requestErrorMessage(error) {
  const payload = error.response?.data;
  if (payload instanceof Blob) {
    try {
      const parsed = JSON.parse(await payload.text());
      return parsed.message || 'Document action failed.';
    } catch {
      return 'Document action failed.';
    }
  }
  return payload?.message || error.message || 'Document action failed.';
}

export default function DocumentActions({ type, record, allowReceipt = false, compact = false, onError }) {
  const [busy, setBusy] = useState('');
  if (!record) return null;

  const run = async (name, action) => {
    setBusy(name);
    try {
      await action();
    } catch (error) {
      const message = await requestErrorMessage(error);
      if (onError) onError(message);
      else window.alert(message);
    } finally {
      setBusy('');
    }
  };

  const buttonClass = compact ? 'px-2 py-1 text-xs' : '';
  return (
    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
      <Button type="button" variant="secondary" className={buttonClass} disabled={!!busy} onClick={() => run('print', async () => {
        const settings = await getDocumentSettings();
        await printTransaction(type, record, settings, { receipt: allowReceipt });
      })}>
        {busy === 'print' ? 'Opening…' : allowReceipt ? 'Print Receipt' : 'Print'}
      </Button>
      <Button type="button" variant="secondary" className={buttonClass} disabled={!!busy} onClick={() => run('pdf', () => downloadDocumentPdf(type, record, 'a4'))}>
        {busy === 'pdf' ? 'Downloading…' : 'Download PDF'}
      </Button>
      {allowReceipt && (
        <Button type="button" variant="secondary" className={buttonClass} disabled={!!busy} onClick={() => run('receipt', () => downloadDocumentPdf(type, record, 'receipt'))}>
          {busy === 'receipt' ? 'Downloading…' : 'Receipt PDF'}
        </Button>
      )}
    </div>
  );
}
