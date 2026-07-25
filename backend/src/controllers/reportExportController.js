const { asyncHandler } = require('../utils/helpers');
const HttpError = require('../utils/httpError');
const { getReportData } = require('../services/reportDataService');
const { createReportWorkbook, createReportPdf, reportFilename } = require('../services/reportExportService');

const exportReport = asyncHandler(async (req, res) => {
  const report = await getReportData(req.params.type, req.query);
  const format = String(req.query.format || 'xlsx').toLowerCase();

  if (format === 'xlsx') {
    const buffer = await createReportWorkbook(report);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(report, 'xlsx')}"`);
    res.setHeader('Content-Length', String(buffer.length));
    return res.send(buffer);
  }

  if (format === 'pdf') {
    const buffer = await createReportPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(report, 'pdf')}"`);
    res.setHeader('Content-Length', String(buffer.length));
    return res.send(buffer);
  }

  throw new HttpError(422, 'Report format must be xlsx or pdf.');
});

module.exports = { exportReport };
