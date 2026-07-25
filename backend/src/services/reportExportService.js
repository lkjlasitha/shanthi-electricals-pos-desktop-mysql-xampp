const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { getSettings } = require('./settingsService');
const { money } = require('./documentService');
const { todayISO } = require('../utils/date');

function safeFilename(value) {
  return String(value || 'report').replace(/[^a-z0-9_.-]+/gi, '-').replace(/-+/g, '-');
}

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function displayValue(value, column, settings) {
  if (column.type === 'money') return money(value, settings);
  if (column.type === 'number') return Number(value || 0).toLocaleString('en-LK', { maximumFractionDigits: 3 });
  return value === null || value === undefined ? '' : String(value);
}

async function createReportWorkbook(report) {
  const settings = await getSettings();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shanthi Electricals POS';
  workbook.company = 'Shanthi Electricals';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(report.title.slice(0, 31));

  worksheet.mergeCells(1, 1, 1, report.columns.length);
  worksheet.getCell(1, 1).value = settings.business_name || 'Shanthi Electricals';
  worksheet.getCell(1, 1).font = { bold: true, size: 16 };
  worksheet.getCell(1, 1).alignment = { horizontal: 'center' };
  worksheet.mergeCells(2, 1, 2, report.columns.length);
  worksheet.getCell(2, 1).value = report.title;
  worksheet.getCell(2, 1).font = { bold: true, size: 13 };
  worksheet.getCell(2, 1).alignment = { horizontal: 'center' };
  if (report.range) {
    worksheet.mergeCells(3, 1, 3, report.columns.length);
    worksheet.getCell(3, 1).value = `${report.range.from} to ${report.range.to}`;
    worksheet.getCell(3, 1).alignment = { horizontal: 'center' };
  }

  const headerRowNumber = 5;
  const header = worksheet.getRow(headerRowNumber);
  report.columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A4B24' } };
    cell.alignment = { horizontal: column.type === 'text' || column.type === 'date' ? 'left' : 'right' };
  });

  report.rows.forEach((row) => {
    const values = report.columns.map((column) => row[column.key]);
    const excelRow = worksheet.addRow(values);
    report.columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1);
      if (column.type === 'money') cell.numFmt = 'Rs. #,##0.00';
      if (column.type === 'number') cell.numFmt = '#,##0.###';
      cell.alignment = { horizontal: column.type === 'text' || column.type === 'date' ? 'left' : 'right' };
    });
  });

  if (report.totals && Object.keys(report.totals).length) {
    const totalRow = worksheet.addRow(report.columns.map((column, index) => {
      if (index === 0) return 'TOTAL';
      return Object.prototype.hasOwnProperty.call(report.totals, column.key) ? report.totals[column.key] : '';
    }));
    totalRow.font = { bold: true };
    report.columns.forEach((column, index) => {
      const cell = totalRow.getCell(index + 1);
      if (column.type === 'money') cell.numFmt = 'Rs. #,##0.00';
      if (column.type === 'number') cell.numFmt = '#,##0.###';
    });
  }

  worksheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  worksheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: report.columns.length } };
  report.columns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = Math.min(Math.max(column.label.length + 4, column.type === 'text' ? 24 : 14), 42);
  });
  worksheet.pageSetup = { orientation: report.columns.length > 4 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  worksheet.headerFooter.oddFooter = '&CShanthi Electricals POS — &D &T — Page &P of &N';

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function createReportPdf(report) {
  const settings = await getSettings();
  const landscape = report.columns.length > 4;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 30, info: { Title: report.title, Author: settings.business_name } });
  const promise = collectPdf(doc);
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const drawHeader = () => {
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#8a4b24').text(settings.business_name || 'Shanthi Electricals');
    doc.fontSize(13).fillColor('#111827').text(report.title, { align: 'right' });
    if (report.range) doc.font('Helvetica').fontSize(9).fillColor('#4b5563').text(`${report.range.from} to ${report.range.to}`, { align: 'right' });
    doc.moveDown(0.7);
  };

  const widths = (() => {
    const textColumns = report.columns.filter((column) => column.type === 'text').length;
    const baseNumeric = 82;
    const numericCount = report.columns.length - textColumns;
    const remaining = pageWidth - numericCount * baseNumeric;
    return report.columns.map((column) => column.type === 'text' ? Math.max(120, remaining / Math.max(textColumns, 1)) : baseNumeric);
  })();
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  if (totalWidth > pageWidth) {
    const scale = pageWidth / totalWidth;
    widths.forEach((width, index) => { widths[index] = width * scale; });
  }

  const drawTableHeader = (y) => {
    doc.rect(doc.page.margins.left, y, pageWidth, 22).fill('#8a4b24');
    let x = doc.page.margins.left;
    report.columns.forEach((column, index) => {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff').text(column.label, x + 3, y + 7, { width: widths[index] - 6, align: column.type === 'text' || column.type === 'date' ? 'left' : 'right' });
      x += widths[index];
    });
    return y + 22;
  };

  drawHeader();
  let y = drawTableHeader(doc.y);
  report.rows.forEach((row, rowIndex) => {
    if (y + 24 > doc.page.height - 55) {
      doc.addPage();
      drawHeader();
      y = drawTableHeader(doc.y);
    }
    if (rowIndex % 2 === 0) doc.rect(doc.page.margins.left, y, pageWidth, 22).fill('#f8fafc');
    let x = doc.page.margins.left;
    report.columns.forEach((column, index) => {
      doc.font('Helvetica').fontSize(7.3).fillColor('#111827').text(displayValue(row[column.key], column, settings), x + 3, y + 7, { width: widths[index] - 6, height: 13, ellipsis: true, align: column.type === 'text' || column.type === 'date' ? 'left' : 'right' });
      x += widths[index];
    });
    y += 22;
  });

  if (report.totals && Object.keys(report.totals).length) {
    if (y + 28 > doc.page.height - 50) { doc.addPage(); drawHeader(); y = drawTableHeader(doc.y); }
    doc.rect(doc.page.margins.left, y, pageWidth, 24).fill('#e2e8f0');
    let x = doc.page.margins.left;
    report.columns.forEach((column, index) => {
      const value = index === 0 ? 'TOTAL' : Object.prototype.hasOwnProperty.call(report.totals, column.key) ? displayValue(report.totals[column.key], column, settings) : '';
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111827').text(value, x + 3, y + 8, { width: widths[index] - 6, align: column.type === 'text' || column.type === 'date' ? 'left' : 'right' });
      x += widths[index];
    });
  }

  doc.font('Helvetica').fontSize(7).fillColor('#6b7280').text(`Generated by Shanthi Electricals POS on ${todayISO()}`, doc.page.margins.left, doc.page.height - 32, { width: pageWidth, align: 'center' });
  doc.end();
  return promise;
}

function reportFilename(report, extension) {
  const suffix = report.range ? `-${report.range.from}-to-${report.range.to}` : `-${todayISO()}`;
  return safeFilename(`${report.key}${suffix}.${extension}`);
}

module.exports = { createReportWorkbook, createReportPdf, reportFilename };
