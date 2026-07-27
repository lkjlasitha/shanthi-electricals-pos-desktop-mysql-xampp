const PDFDocument = require('pdfkit');
const { todayISO } = require('../utils/date');
const {
  Sale, SaleItem, SalesPayment, Customer, Warehouse,
  Quotation, QuotationItem,
  Purchase, PurchaseItem, Supplier,
  SaleReturn, SaleReturnItem,
  PurchaseReturn, PurchaseReturnItem,
  Transfer, TransferItem,
  Adjustment, AdjustmentItem,
  Product,
} = require('../models/associations');
const { getSettings } = require('./settingsService');

const TYPE_ALIASES = Object.freeze({
  sale: 'sale',
  sales: 'sale',
  invoice: 'sale',
  receipt: 'sale',
  quotation: 'quotation',
  quotations: 'quotation',
  quote: 'quotation',
  purchase: 'purchase',
  purchases: 'purchase',
  'sale-return': 'sale-return',
  sale_return: 'sale-return',
  'purchase-return': 'purchase-return',
  purchase_return: 'purchase-return',
  transfer: 'transfer',
  transfers: 'transfer',
  adjustment: 'adjustment',
  adjustments: 'adjustment',
});

function canonicalType(value) {
  return TYPE_ALIASES[String(value || '').toLowerCase()] || null;
}

async function loadDocument(type, id) {
  const canonical = canonicalType(type);
  const numericId = Number(id);
  if (!canonical || !Number.isInteger(numericId) || numericId <= 0) return null;

  let record;
  switch (canonical) {
    case 'sale':
      record = await Sale.findByPk(numericId, {
        include: [
          Customer,
          Warehouse,
          { model: SaleItem, as: 'items', include: [Product] },
          { model: SalesPayment, as: 'payments' },
        ],
      });
      break;
    case 'quotation':
      record = await Quotation.findByPk(numericId, {
        include: [Customer, Warehouse, { model: QuotationItem, as: 'items', include: [Product] }],
      });
      break;
    case 'purchase':
      record = await Purchase.findByPk(numericId, {
        include: [Supplier, Warehouse, { model: PurchaseItem, as: 'items', include: [Product] }],
      });
      break;
    case 'sale-return':
      record = await SaleReturn.findByPk(numericId, {
        include: [Customer, Warehouse, Sale, { model: SaleReturnItem, as: 'items', include: [Product] }],
      });
      break;
    case 'purchase-return':
      record = await PurchaseReturn.findByPk(numericId, {
        include: [Supplier, Warehouse, Purchase, { model: PurchaseReturnItem, as: 'items', include: [Product] }],
      });
      break;
    case 'transfer':
      record = await Transfer.findByPk(numericId, {
        include: [
          { model: Warehouse, as: 'fromWarehouse' },
          { model: Warehouse, as: 'toWarehouse' },
          { model: TransferItem, as: 'items', include: [Product] },
        ],
      });
      break;
    case 'adjustment':
      record = await Adjustment.findByPk(numericId, {
        include: [Warehouse, { model: AdjustmentItem, as: 'items', include: [Product] }],
      });
      break;
    default:
      return null;
  }

  return record ? { type: canonical, record: record.toJSON() } : null;
}

function money(value, settings) {
  const symbol = settings.currency_symbol || (settings.default_currency === 'LKR' ? 'Rs.' : settings.default_currency || '');
  return `${symbol} ${Number(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function text(value, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function documentMeta(type, record) {
  switch (type) {
    case 'sale':
      return {
        title: 'SALES INVOICE',
        partyLabel: 'Customer',
        party: record.Customer,
        warehouse: record.Warehouse,
        status: record.payment_status,
        unitField: 'product_price',
        unitLabel: 'Unit price',
        notes: record.note,
      };
    case 'quotation':
      return {
        title: 'QUOTATION',
        partyLabel: 'Customer',
        party: record.Customer,
        warehouse: record.Warehouse,
        status: record.status,
        unitField: 'product_price',
        unitLabel: 'Unit price',
        notes: record.note,
      };
    case 'purchase':
      return {
        title: 'PURCHASE',
        partyLabel: 'Supplier',
        party: record.Supplier,
        warehouse: record.Warehouse,
        status: record.status,
        unitField: 'product_cost',
        unitLabel: 'Unit cost',
        notes: record.notes,
      };
    case 'sale-return':
      return {
        title: 'SALE RETURN / CREDIT NOTE',
        partyLabel: 'Customer',
        party: record.Customer,
        warehouse: record.Warehouse,
        status: 'completed',
        unitField: 'unit_price',
        unitLabel: 'Unit price',
        notes: record.notes,
      };
    case 'purchase-return':
      return {
        title: 'PURCHASE RETURN',
        partyLabel: 'Supplier',
        party: record.Supplier,
        warehouse: record.Warehouse,
        status: 'completed',
        unitField: 'unit_cost',
        unitLabel: 'Unit cost',
        notes: record.notes,
      };
    case 'transfer':
      return {
        title: 'STOCK TRANSFER NOTE',
        partyLabel: 'Route',
        party: {
          name: `${record.fromWarehouse?.name || '-'} → ${record.toWarehouse?.name || '-'}`,
          address: '', phone: '', email: '',
        },
        warehouse: null,
        status: record.status,
        unitField: 'purchase_cost',
        unitLabel: 'Unit value',
        notes: record.notes,
      };
    case 'adjustment':
      return {
        title: 'STOCK ADJUSTMENT NOTE',
        partyLabel: 'Warehouse',
        party: record.Warehouse,
        warehouse: record.Warehouse,
        status: 'completed',
        unitField: null,
        unitLabel: '',
        notes: record.notes,
      };
    default:
      throw new Error(`Unsupported document type: ${type}`);
  }
}

function itemRows(type, record, meta) {
  return (record.items || []).map((item) => {
    const product = item.Product || {};
    const unitValue = meta.unitField ? Number(item[meta.unitField] || 0) : null;
    let total = Number(item.sub_total || 0);
    if (type === 'adjustment') total = null;
    return {
      name: item.item_name || product.name || (item.product_id ? `Product #${item.product_id}` : 'Manual item'),
      code: item.item_code || product.code || '',
      quantity: Number(item.quantity || 0),
      unitValue,
      discount: Number(item.discount_amount || 0),
      tax: Number(item.tax_amount || 0),
      total,
      movement: item.type || '',
    };
  });
}

function safeFilename(value) {
  return String(value || 'document').replace(/[^a-z0-9_.-]+/gi, '-').replace(/-+/g, '-');
}

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function drawBusinessHeader(doc, settings, meta, record) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#8a4b24').text(settings.business_name || 'Shanthi Electricals', left, 38, { width: 310 });
  doc.font('Helvetica').fontSize(9).fillColor('#333333');
  doc.text(settings.business_address || '', left, 65, { width: 310 });
  const contact = [settings.business_phone, settings.business_email].filter(Boolean).join('  |  ');
  if (contact) doc.text(contact, left, doc.y + 2, { width: 310 });
  if (settings.business_tax_number) doc.text(`TIN/VAT: ${settings.business_tax_number}`, left, doc.y + 2, { width: 310 });

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#1f2937').text(meta.title, right - 190, 40, { width: 190, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  doc.text(`Reference: ${text(record.reference_code, `#${record.id}`)}`, right - 210, 66, { width: 210, align: 'right' });
  doc.text(`Date: ${text(record.date)}`, right - 210, doc.y + 2, { width: 210, align: 'right' });
  doc.text(`Status: ${text(meta.status).toUpperCase()}`, right - 210, doc.y + 2, { width: 210, align: 'right' });

  doc.moveTo(left, 112).lineTo(right, 112).strokeColor('#d1d5db').stroke();
}

function drawInfoBoxes(doc, settings, meta) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const gap = 14;
  const boxWidth = (width - gap) / 2;
  const y = 128;

  const party = meta.party || {};
  doc.roundedRect(left, y, boxWidth, 88, 4).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.fillColor('#8a4b24').font('Helvetica-Bold').fontSize(10).text(meta.partyLabel, left + 10, y + 9);
  doc.fillColor('#111827').fontSize(11).text(text(party.name), left + 10, y + 27, { width: boxWidth - 20 });
  doc.font('Helvetica').fontSize(8.5).fillColor('#4b5563');
  doc.text([party.address, party.city, party.country].filter(Boolean).join(', '), left + 10, y + 44, { width: boxWidth - 20, height: 22 });
  const partyContact = [party.phone, party.email].filter(Boolean).join(' | ');
  if (partyContact) doc.text(partyContact, left + 10, y + 69, { width: boxWidth - 20 });

  const x2 = left + boxWidth + gap;
  doc.roundedRect(x2, y, boxWidth, 88, 4).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.fillColor('#8a4b24').font('Helvetica-Bold').fontSize(10).text('Fulfilment', x2 + 10, y + 9);
  doc.fillColor('#111827').fontSize(10).text(`Warehouse: ${text(meta.warehouse?.name)}`, x2 + 10, y + 28, { width: boxWidth - 20 });
  if (meta.warehouse?.address) doc.font('Helvetica').fontSize(8.5).fillColor('#4b5563').text(meta.warehouse.address, x2 + 10, y + 45, { width: boxWidth - 20 });
  doc.text(`Currency: ${settings.default_currency || 'LKR'}`, x2 + 10, y + 69, { width: boxWidth - 20 });
}

function tableHeader(doc, y, meta, type) {
  const left = doc.page.margins.left;
  const widths = type === 'adjustment'
    ? [250, 80, 90, 100]
    : [183, 45, 78, 62, 62, 93];
  const labels = type === 'adjustment'
    ? ['Item', 'Qty', 'Movement', 'Code']
    : ['Item', 'Qty', meta.unitLabel, 'Discount', 'Tax', 'Total'];
  doc.rect(left, y, widths.reduce((a, b) => a + b, 0), 22).fill('#8a4b24');
  let x = left;
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  labels.forEach((label, index) => {
    doc.text(label, x + 4, y + 7, { width: widths[index] - 8, align: index === 0 ? 'left' : 'right' });
    x += widths[index];
  });
  return { widths, nextY: y + 22 };
}

function ensurePage(doc, y, height, meta, type) {
  if (y + height <= doc.page.height - doc.page.margins.bottom - 100) return y;
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f2937').text(`${meta.title} — continued`, doc.page.margins.left, 36);
  return tableHeader(doc, 58, meta, type).nextY;
}

function drawItemsTable(doc, rows, settings, meta, type) {
  let { widths, nextY: y } = tableHeader(doc, 232, meta, type);
  const left = doc.page.margins.left;

  rows.forEach((row, rowIndex) => {
    const rowHeight = 28;
    y = ensurePage(doc, y, rowHeight, meta, type);
    if (rowIndex % 2 === 0) doc.rect(left, y, widths.reduce((a, b) => a + b, 0), rowHeight).fill('#f8fafc');
    let x = left;
    doc.fillColor('#111827').font('Helvetica').fontSize(8);
    const name = row.code ? `${row.name}\n${row.code}` : row.name;
    doc.text(name, x + 4, y + 5, { width: widths[0] - 8, height: rowHeight - 8 });
    x += widths[0];
    doc.text(String(row.quantity), x + 4, y + 9, { width: widths[1] - 8, align: 'right' });
    x += widths[1];
    if (type === 'adjustment') {
      doc.text(text(row.movement).toUpperCase(), x + 4, y + 9, { width: widths[2] - 8, align: 'right' });
      x += widths[2];
      doc.text(row.code || '-', x + 4, y + 9, { width: widths[3] - 8, align: 'right' });
    } else {
      [money(row.unitValue, settings), money(row.discount, settings), money(row.tax, settings), money(row.total, settings)].forEach((value, index) => {
        doc.text(value, x + 4, y + 9, { width: widths[index + 2] - 8, align: 'right' });
        x += widths[index + 2];
      });
    }
    y += rowHeight;
  });
  return y;
}

function drawTotals(doc, y, record, settings, type) {
  if (type === 'adjustment') return y;
  y += 16;
  if (y > doc.page.height - 230) {
    doc.addPage();
    y = 60;
  }
  const right = doc.page.width - doc.page.margins.right;
  const labelX = right - 220;
  const valueX = right - 110;
  const lines = [
    ['Order tax', record.tax_amount],
    ['Discount', record.discount],
    ['Shipping', record.shipping],
    ['Grand total', record.grand_total],
  ];
  if (type === 'sale' || type === 'purchase') lines.push(['Paid amount', record.paid_amount ?? record.received_amount]);

  lines.forEach(([label, value], index) => {
    const isTotal = label === 'Grand total';
    if (isTotal) doc.rect(labelX - 8, y - 4, 228, 24).fill('#f1f5f9');
    doc.fillColor('#374151').font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isTotal ? 10 : 9).text(label, labelX, y, { width: 105 });
    doc.fillColor(isTotal ? '#8a4b24' : '#111827').text(money(value, settings), valueX, y, { width: 110, align: 'right' });
    y += isTotal ? 28 : 20;
    if (index === lines.length - 1 && record.grand_total !== undefined) {
      const balance = Number(record.grand_total || 0) - Number(record.paid_amount || record.received_amount || 0);
      if ((type === 'sale' || type === 'purchase') && balance > 0.005) {
        doc.fillColor('#b91c1c').font('Helvetica-Bold').text('Balance due', labelX, y, { width: 105 });
        doc.text(money(balance, settings), valueX, y, { width: 110, align: 'right' });
        y += 20;
      }
    }
  });
  return y;
}

function drawFooter(doc, settings, meta, record, y) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  y = Math.max(y + 18, doc.page.height - 150);
  if (y > doc.page.height - 95) {
    doc.addPage();
    y = 80;
  }
  if (meta.notes) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text('Notes', left, y);
    doc.font('Helvetica').fontSize(8.5).text(text(meta.notes), left, y + 14, { width, height: 38 });
    y += 54;
  }
  const footer = meta.title === 'QUOTATION' ? settings.quotation_terms : settings.receipt_footer;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#d1d5db').stroke();
  doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(footer || '', left, y + 10, { width, align: 'center' });
  doc.text(`Generated by Shanthi Electricals POS · ${todayISO()}`, left, y + 25, { width, align: 'center' });
}

async function createA4DocumentPdf(type, record, settings) {
  const meta = documentMeta(type, record);
  const rows = itemRows(type, record, meta);
  const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `${meta.title} ${record.reference_code || record.id}`, Author: settings.business_name } });
  const promise = collectPdf(doc);
  drawBusinessHeader(doc, settings, meta, record);
  drawInfoBoxes(doc, settings, meta);
  let y = drawItemsTable(doc, rows, settings, meta, type);
  y = drawTotals(doc, y, record, settings, type);
  drawFooter(doc, settings, meta, record, y);
  doc.end();
  return promise;
}

async function createReceiptPdf(record, settings) {
  const width = 226.77; // 80 mm
  const rowCount = Math.max((record.items || []).length, 1);
  const height = Math.max(500, 330 + rowCount * 48);
  const doc = new PDFDocument({ size: [width, height], margin: 12, info: { Title: `Receipt ${record.reference_code || record.id}` } });
  const promise = collectPdf(doc);
  const contentWidth = width - 24;

  doc.font('Helvetica-Bold').fontSize(14).text(settings.business_name || 'Shanthi Electricals', { width: contentWidth, align: 'center' });
  doc.font('Helvetica').fontSize(7.5).fillColor('#333333');
  if (settings.business_address) doc.text(settings.business_address, { width: contentWidth, align: 'center' });
  if (settings.business_phone) doc.text(settings.business_phone, { width: contentWidth, align: 'center' });
  if (settings.business_tax_number) doc.text(`TIN/VAT: ${settings.business_tax_number}`, { width: contentWidth, align: 'center' });
  doc.moveDown(0.5).moveTo(12, doc.y).lineTo(width - 12, doc.y).dash(2, { space: 2 }).stroke().undash();
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(8).text('SALES RECEIPT', { align: 'center' });
  doc.font('Helvetica').fontSize(7.5);
  doc.text(`Invoice: ${text(record.reference_code, `#${record.id}`)}`);
  doc.text(`Date: ${text(record.date)}`);
  doc.text(`Customer: ${text(record.Customer?.name, 'Walk-in Customer')}`);
  doc.text(`Payment: ${text(record.payment_type).replace(/_/g, ' ')}`);
  doc.moveDown(0.4).moveTo(12, doc.y).lineTo(width - 12, doc.y).dash(2, { space: 2 }).stroke().undash();
  doc.moveDown(0.4);

  (record.items || []).forEach((item) => {
    const product = item.Product || {};
    const itemName = item.item_name || product.name || (item.product_id ? `Product #${item.product_id}` : 'Manual item');
    const itemCode = item.item_code || product.code || '';
    const discount = Number(item.discount_amount || 0);

    doc.font('Helvetica-Bold').fontSize(7.5).text(itemName, { width: contentWidth });
    if (itemCode) doc.font('Helvetica').fontSize(6.5).fillColor('#555555').text(itemCode, { width: contentWidth });
    doc.fillColor('#333333');

    const detailY = doc.y;
    doc.font('Helvetica').fontSize(7.2).text(`${Number(item.quantity || 0)} × ${money(item.product_price, settings)}`, 12, detailY, { width: 125 });
    doc.text(money(item.sub_total, settings), width - 92, detailY, { width: 80, align: 'right' });
    doc.y = detailY + 10;

    if (discount > 0) {
      const discountY = doc.y;
      doc.fontSize(6.8).fillColor('#555555').text('Item discount', 12, discountY, { width: 90 });
      doc.text(`-${money(discount, settings)}`, width - 92, discountY, { width: 80, align: 'right' });
      doc.fillColor('#333333');
      doc.y = discountY + 9;
    }
    doc.moveDown(0.25);
  });

  doc.moveTo(12, doc.y).lineTo(width - 12, doc.y).dash(2, { space: 2 }).stroke().undash();
  doc.moveDown(0.45);
  const receiptLine = (label, value, bold = false) => {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 9 : 7.5).text(label, 12, y, { width: 90 });
    doc.text(money(value, settings), width - 112, y, { width: 100, align: 'right' });
    doc.y = y + (bold ? 15 : 12);
  };
  receiptLine('Tax', record.tax_amount);
  receiptLine('Discount', record.discount);
  receiptLine('TOTAL', record.grand_total, true);
  receiptLine('Paid', record.paid_amount);
  const balance = Number(record.grand_total || 0) - Number(record.paid_amount || 0);
  if (balance > 0.005) receiptLine('Balance', balance, true);
  const change = Number(record.received_amount || 0) - Number(record.grand_total || 0);
  if (change > 0.005) receiptLine('Change', change);

  doc.moveDown(0.4).moveTo(12, doc.y).lineTo(width - 12, doc.y).dash(2, { space: 2 }).stroke().undash();
  doc.moveDown(0.6).font('Helvetica').fontSize(7.5).text(settings.receipt_footer || 'Thank you.', { width: contentWidth, align: 'center' });
  doc.text('Shanthi Electricals POS', { width: contentWidth, align: 'center' });
  doc.end();
  return promise;
}

async function createDocumentPdf(type, record, options = {}) {
  const settings = await getSettings();
  const canonical = canonicalType(type);
  if (canonical === 'sale' && options.format === 'receipt') return createReceiptPdf(record, settings);
  return createA4DocumentPdf(canonical, record, settings);
}

function documentFilename(type, record, format = 'a4') {
  const prefix = format === 'receipt' ? 'receipt' : canonicalType(type);
  return safeFilename(`${prefix}-${record.reference_code || record.id}.pdf`);
}

module.exports = {
  canonicalType,
  loadDocument,
  createDocumentPdf,
  documentFilename,
  money,
};
