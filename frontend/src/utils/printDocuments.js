function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(value, settings = {}) {
  const symbol = settings.currency_symbol || (settings.default_currency === 'LKR' ? 'Rs.' : settings.default_currency || 'Rs.');
  return `${symbol} ${Number(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function human(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function transactionMeta(type, record) {
  switch (type) {
    case 'sale': return { title: 'Sales Invoice', partyLabel: 'Customer', party: record.Customer, warehouse: record.Warehouse, unitKey: 'product_price', unitLabel: 'Unit Price', notes: record.note };
    case 'quotation': return { title: 'Quotation', partyLabel: 'Customer', party: record.Customer, warehouse: record.Warehouse, unitKey: 'product_price', unitLabel: 'Unit Price', notes: record.note };
    case 'purchase': return { title: 'Purchase', partyLabel: 'Supplier', party: record.Supplier, warehouse: record.Warehouse, unitKey: 'product_cost', unitLabel: 'Unit Cost', notes: record.notes };
    case 'sale-return': return { title: 'Sale Return / Credit Note', partyLabel: 'Customer', party: record.Customer, warehouse: record.Warehouse, unitKey: 'unit_price', unitLabel: 'Unit Price', notes: record.notes };
    case 'purchase-return': return { title: 'Purchase Return', partyLabel: 'Supplier', party: record.Supplier, warehouse: record.Warehouse, unitKey: 'unit_cost', unitLabel: 'Unit Cost', notes: record.notes };
    case 'transfer': return { title: 'Stock Transfer Note', partyLabel: 'Route', party: { name: `${record.fromWarehouse?.name || '-'} → ${record.toWarehouse?.name || '-'}` }, warehouse: null, unitKey: 'purchase_cost', unitLabel: 'Unit Value', notes: record.notes };
    case 'adjustment': return { title: 'Stock Adjustment Note', partyLabel: 'Warehouse', party: record.Warehouse, warehouse: record.Warehouse, unitKey: null, unitLabel: '', notes: record.notes };
    default: throw new Error(`Unsupported print document type: ${type}`);
  }
}

function sharedStyles(receipt = false) {
  return `
    @page { size: ${receipt ? '80mm auto' : 'A4'}; margin: ${receipt ? '4mm' : '12mm'}; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #172033; background: #fff; }
    body { ${receipt ? 'width:72mm;font-size:10px;' : 'font-size:12px;'} }
    .document { width: 100%; }
    .header { display:flex; justify-content:space-between; gap:24px; border-bottom:2px solid #9a5b32; padding-bottom:12px; margin-bottom:16px; }
    .brand { color:#8a4b24; font-size:${receipt ? '16px' : '24px'}; font-weight:700; }
    .muted { color:#5b6474; }
    .title { text-align:right; font-size:${receipt ? '12px' : '20px'}; font-weight:700; text-transform:uppercase; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
    .box { border:1px solid #d8dee8; background:#f8fafc; padding:10px; border-radius:5px; min-height:74px; }
    .box-title { color:#8a4b24; text-transform:uppercase; font-size:10px; font-weight:700; margin-bottom:6px; }
    table { width:100%; border-collapse:collapse; }
    th { background:#8a4b24; color:white; text-align:left; font-size:${receipt ? '8px' : '10px'}; padding:${receipt ? '4px 2px' : '7px 6px'}; }
    td { border-bottom:1px solid #e7ebf0; padding:${receipt ? '4px 2px' : '7px 6px'}; vertical-align:top; }
    .number { text-align:right; white-space:nowrap; }
    .totals { margin-left:auto; margin-top:14px; width:${receipt ? '100%' : '42%'}; }
    .totals td { padding:5px 6px; }
    .grand td { font-size:${receipt ? '12px' : '15px'}; font-weight:700; background:#f1f5f9; color:#8a4b24; }
    .notes { margin-top:18px; padding-top:10px; border-top:1px solid #d8dee8; }
    .footer { text-align:center; margin-top:20px; padding-top:10px; border-top:1px dashed #9ca3af; color:#5b6474; font-size:${receipt ? '9px' : '10px'}; }
    .receipt-only { display:${receipt ? 'block' : 'none'}; }
    @media print { .no-print { display:none !important; } }
  `;
}

export const PRINT_STORAGE_KEYS = Object.freeze({
  receiptPrinter: 'shanthi_pos_receipt_printer',
  silentReceipt: 'shanthi_pos_silent_receipt',
});

function printableDocument(html, title, autoPrint = false) {
  const script = autoPrint
    ? `<script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),180)});<\/script>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${html}${script}</body></html>`;
}

async function printWindow(html, title, options = {}) {
  const desktop = window.shanthiDesktop;
  if (desktop?.printHtml) {
    const receiptPrinter = localStorage.getItem(PRINT_STORAGE_KEYS.receiptPrinter) || '';
    const silentReceipt = localStorage.getItem(PRINT_STORAGE_KEYS.silentReceipt) === 'true';
    return desktop.printHtml({
      html: printableDocument(html, title, false),
      silent: Boolean(options.receipt && silentReceipt && receiptPrinter),
      deviceName: options.receipt ? receiptPrinter : '',
      noMargins: Boolean(options.receipt),
    });
  }

  const popup = window.open('', '_blank', 'width=980,height=760');
  if (!popup) throw new Error('The print window was blocked. Allow pop-ups for this site and try again.');
  try { popup.opener = null; } catch { /* browser-managed */ }
  popup.document.open();
  popup.document.write(printableDocument(html, title, true));
  popup.document.close();
  return popup;
}

function transactionHtml(type, record, settings = {}, receipt = false) {
  const meta = transactionMeta(type, record);
  const party = meta.party || {};
  const items = record.items || [];
  const status = record.payment_status || record.status || 'completed';
  const itemHeader = type === 'adjustment'
    ? '<th>Item</th><th class="number">Qty</th><th class="number">Movement</th>'
    : `<th>Item</th><th class="number">Qty</th><th class="number">${escapeHtml(meta.unitLabel)}</th><th class="number">Discount</th><th class="number">Tax</th><th class="number">Total</th>`;
  const itemRows = items.map((item) => {
    const product = item.Product || {};
    if (type === 'adjustment') {
      return `<tr><td><strong>${escapeHtml(product.name || `Product #${item.product_id}`)}</strong><br><span class="muted">${escapeHtml(product.code || '')}</span></td><td class="number">${escapeHtml(item.quantity)}</td><td class="number">${escapeHtml(human(item.type))}</td></tr>`;
    }
    return `<tr>
      <td><strong>${escapeHtml(product.name || `Product #${item.product_id}`)}</strong><br><span class="muted">${escapeHtml(product.code || '')}</span></td>
      <td class="number">${escapeHtml(item.quantity)}</td>
      <td class="number">${escapeHtml(money(item[meta.unitKey], settings))}</td>
      <td class="number">${escapeHtml(money(item.discount_amount, settings))}</td>
      <td class="number">${escapeHtml(money(item.tax_amount, settings))}</td>
      <td class="number">${escapeHtml(money(item.sub_total, settings))}</td>
    </tr>`;
  }).join('');

  const paid = Number(record.paid_amount ?? record.received_amount ?? 0);
  const balance = Math.max(Number(record.grand_total || 0) - paid, 0);
  const totals = type === 'adjustment' ? '' : `<table class="totals">
    <tr><td>Order tax</td><td class="number">${escapeHtml(money(record.tax_amount, settings))}</td></tr>
    <tr><td>Discount</td><td class="number">${escapeHtml(money(record.discount, settings))}</td></tr>
    <tr><td>Shipping</td><td class="number">${escapeHtml(money(record.shipping, settings))}</td></tr>
    <tr class="grand"><td>Grand total</td><td class="number">${escapeHtml(money(record.grand_total, settings))}</td></tr>
    ${(type === 'sale' || type === 'purchase') ? `<tr><td>Paid</td><td class="number">${escapeHtml(money(paid, settings))}</td></tr>${balance > 0.005 ? `<tr><td><strong>Balance due</strong></td><td class="number"><strong>${escapeHtml(money(balance, settings))}</strong></td></tr>` : ''}` : ''}
  </table>`;

  return `<style>${sharedStyles(receipt)}</style><main class="document">
    <section class="header">
      <div>
        <div class="brand">${escapeHtml(settings.business_name || 'Shanthi Electricals')}</div>
        <div>${escapeHtml(settings.business_address || '')}</div>
        <div>${escapeHtml([settings.business_phone, settings.business_email].filter(Boolean).join(' · '))}</div>
        ${settings.business_tax_number ? `<div>TIN/VAT: ${escapeHtml(settings.business_tax_number)}</div>` : ''}
      </div>
      <div>
        <div class="title">${escapeHtml(receipt && type === 'sale' ? 'Sales Receipt' : meta.title)}</div>
        <div><strong>Reference:</strong> ${escapeHtml(record.reference_code || `#${record.id}`)}</div>
        <div><strong>Date:</strong> ${escapeHtml(record.date || '')}</div>
        <div><strong>Status:</strong> ${escapeHtml(human(status))}</div>
      </div>
    </section>
    <section class="info-grid">
      <div class="box"><div class="box-title">${escapeHtml(meta.partyLabel)}</div><strong>${escapeHtml(party.name || '-')}</strong><br>${escapeHtml([party.address, party.city, party.country].filter(Boolean).join(', '))}<br>${escapeHtml([party.phone, party.email].filter(Boolean).join(' · '))}</div>
      <div class="box"><div class="box-title">Fulfilment</div><strong>Warehouse:</strong> ${escapeHtml(meta.warehouse?.name || '-')}<br><strong>Currency:</strong> ${escapeHtml(settings.default_currency || 'LKR')}</div>
    </section>
    <table><thead><tr>${itemHeader}</tr></thead><tbody>${itemRows || `<tr><td colspan="6">No line items.</td></tr>`}</tbody></table>
    ${totals}
    ${meta.notes ? `<div class="notes"><strong>Notes</strong><br>${escapeHtml(meta.notes)}</div>` : ''}
    <div class="footer">${escapeHtml(meta.title === 'Quotation' ? (settings.quotation_terms || '') : (settings.receipt_footer || 'Thank you for shopping with Shanthi Electricals.'))}<br>Generated by Shanthi Electricals POS</div>
  </main>`;
}

function receiptHtml(record, settings = {}) {
  const items = record.items || [];
  const paid = Number(record.paid_amount || 0);
  const received = Number(record.received_amount || paid);
  const total = Number(record.grand_total || 0);
  const balance = Math.max(total - paid, 0);
  const change = Math.max(received - total, 0);
  const line = (label, value, strong = false) => `<div class="receipt-total${strong ? ' strong' : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(money(value, settings))}</span></div>`;
  const itemRows = items.map((item) => {
    const product = item.Product || {};
    return `<div class="receipt-item">
      <div class="receipt-item-name">${escapeHtml(product.name || `Product #${item.product_id}`)}</div>
      ${product.code ? `<div class="receipt-code">${escapeHtml(product.code)}</div>` : ''}
      <div class="receipt-item-line"><span>${escapeHtml(item.quantity)} × ${escapeHtml(money(item.product_price, settings))}</span><strong>${escapeHtml(money(item.sub_total, settings))}</strong></div>
    </div>`;
  }).join('');

  return `<style>
    @page { size: 80mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; background:#fff; color:#111; font-family:Arial,Helvetica,sans-serif; }
    body { width:74mm; font-size:10px; }
    .receipt { width:100%; }
    .receipt-brand { text-align:center; font-size:16px; font-weight:700; margin-bottom:3px; }
    .receipt-center { text-align:center; line-height:1.35; }
    .receipt-title { text-align:center; font-size:11px; font-weight:700; letter-spacing:.8px; margin:7px 0; }
    .receipt-separator { border-top:1px dashed #555; margin:7px 0; }
    .receipt-meta { display:grid; grid-template-columns:22mm 1fr; gap:2px 3px; line-height:1.35; }
    .receipt-meta strong { font-weight:700; }
    .receipt-item { padding:4px 0; border-bottom:1px dotted #aaa; }
    .receipt-item-name { font-weight:700; font-size:10px; overflow-wrap:anywhere; }
    .receipt-code { color:#555; font-size:8px; margin-top:1px; }
    .receipt-item-line, .receipt-total { display:flex; justify-content:space-between; gap:5px; margin-top:2px; }
    .receipt-total { padding:1px 0; }
    .receipt-total.strong { font-size:12px; font-weight:700; border-top:1px solid #222; border-bottom:1px solid #222; padding:4px 0; margin:3px 0; }
    .receipt-footer { text-align:center; line-height:1.4; margin-top:8px; }
  </style><main class="receipt">
    <div class="receipt-brand">${escapeHtml(settings.business_name || 'Shanthi Electricals')}</div>
    <div class="receipt-center">${escapeHtml(settings.business_address || '')}</div>
    <div class="receipt-center">${escapeHtml([settings.business_phone, settings.business_email].filter(Boolean).join(' · '))}</div>
    ${settings.business_tax_number ? `<div class="receipt-center">TIN/VAT: ${escapeHtml(settings.business_tax_number)}</div>` : ''}
    <div class="receipt-separator"></div>
    <div class="receipt-title">SALES RECEIPT</div>
    <div class="receipt-meta">
      <strong>Invoice</strong><span>${escapeHtml(record.reference_code || `#${record.id}`)}</span>
      <strong>Date</strong><span>${escapeHtml(record.date || '')}</span>
      <strong>Customer</strong><span>${escapeHtml(record.Customer?.name || 'Walk-in Customer')}</span>
      <strong>Payment</strong><span>${escapeHtml(human(record.payment_type || record.payment_status || 'cash'))}</span>
    </div>
    <div class="receipt-separator"></div>
    ${itemRows || '<div>No line items.</div>'}
    <div class="receipt-separator"></div>
    ${line('Tax', record.tax_amount)}
    ${line('Discount', record.discount)}
    ${Number(record.shipping || 0) ? line('Shipping', record.shipping) : ''}
    ${line('TOTAL', total, true)}
    ${line('Paid', paid)}
    ${balance > 0.005 ? line('Balance', balance, true) : ''}
    ${change > 0.005 ? line('Change', change) : ''}
    <div class="receipt-separator"></div>
    <div class="receipt-footer">${escapeHtml(settings.receipt_footer || 'Thank you for shopping with Shanthi Electricals.')}<br>Shanthi Electricals POS</div>
  </main>`;
}

export function printTransaction(type, record, settings = {}, options = {}) {
  const receipt = type === 'sale' && Boolean(options.receipt);
  const html = receipt ? receiptHtml(record, settings) : transactionHtml(type, record, settings, false);
  return printWindow(html, `${record.reference_code || type}`, { receipt });
}

export function printReport({ title, columns, rows, totals = {}, settings = {}, range }) {
  const headers = columns.map((column) => `<th class="${column.align === 'right' ? 'number' : ''}">${escapeHtml(column.label)}</th>`).join('');
  const body = rows.map((row) => `<tr>${columns.map((column) => {
    const raw = row[column.key];
    const value = column.type === 'money' ? money(raw, settings) : raw;
    return `<td class="${column.align === 'right' ? 'number' : ''}">${escapeHtml(value)}</td>`;
  }).join('')}</tr>`).join('');
  const totalRow = Object.keys(totals).length ? `<tr class="grand">${columns.map((column, index) => {
    const value = index === 0 ? 'TOTAL' : totals[column.key];
    return `<td class="${column.align === 'right' ? 'number' : ''}">${escapeHtml(column.type === 'money' && value !== undefined ? money(value, settings) : value ?? '')}</td>`;
  }).join('')}</tr>` : '';
  const html = `<style>${sharedStyles(false)}</style><main class="document"><section class="header"><div><div class="brand">${escapeHtml(settings.business_name || 'Shanthi Electricals')}</div><div>${escapeHtml(settings.business_address || '')}</div></div><div><div class="title">${escapeHtml(title)}</div>${range ? `<div>${escapeHtml(range)}</div>` : ''}</div></section><table><thead><tr>${headers}</tr></thead><tbody>${body}${totalRow}</tbody></table><div class="footer">Generated by Shanthi Electricals POS</div></main>`;
  return printWindow(html, title);
}
