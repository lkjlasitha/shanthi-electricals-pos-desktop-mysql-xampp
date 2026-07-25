const { asyncHandler } = require('../utils/helpers');
const {
  canonicalType,
  loadDocument,
  createDocumentPdf,
  documentFilename,
} = require('../services/documentService');

const downloadPdf = asyncHandler(async (req, res) => {
  const type = canonicalType(req.params.type);
  if (!type) return res.status(404).json({ message: 'Unsupported document type.' });

  const loaded = await loadDocument(type, req.params.id);
  if (!loaded) return res.status(404).json({ message: 'Document not found.' });

  const format = type === 'sale' && req.query.format === 'receipt' ? 'receipt' : 'a4';
  const buffer = await createDocumentPdf(type, loaded.record, { format });
  const filename = documentFilename(type, loaded.record, format);
  const disposition = req.query.inline === '1' ? 'inline' : 'attachment';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
});

module.exports = { downloadPdf };
