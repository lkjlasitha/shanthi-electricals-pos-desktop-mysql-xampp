const fs = require('fs');
const path = require('path');

// Bundled default logo (extracted from the Shantha Electricals letterhead).
// Shops can replace it from Settings without touching this file; the value
// lives in the `settings` table once seeded.
const LOGO_PATH = path.join(__dirname, 'business-logo.png');

let cachedDataUri = null;

function getDefaultLogoDataUri() {
  if (cachedDataUri) return cachedDataUri;
  try {
    const buffer = fs.readFileSync(LOGO_PATH);
    cachedDataUri = `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    cachedDataUri = '';
  }
  return cachedDataUri;
}

module.exports = { getDefaultLogoDataUri };
