export function filenameFromDisposition(disposition, fallback = 'download') {
  const match = String(disposition || '').match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/^"|"$/g, '')) : fallback;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function saveResponseBlob(response, fallbackFilename) {
  const filename = filenameFromDisposition(response.headers?.['content-disposition'], fallbackFilename);
  saveBlob(response.data, filename);
  return filename;
}
