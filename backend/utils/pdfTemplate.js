/**
 * Program Sheet PDF Template
 * Handles rendering of program list PDF documents with Chinese font support
 */

/**
 * Find available Chinese font path for PDF generation
 */
function findAvailableChineseFontPath() {
  const candidates = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/System/Library/Fonts/Supplemental/Songti.ttc',
    '/Library/Fonts/Arial Unicode.ttf'
  ];

  const fs = require('fs');
  return candidates.find((fontPath) => fs.existsSync(fontPath)) || null;
}

/**
 * Render program sheet PDF document
 * @param {PDFDocument} doc - PDFKit document instance
 * @param {Array} list - List of tracks/programs
 * @param {string} recordName - Name of the record/show
 */
function renderProgramSheetPdf(doc, list, recordName) {
  const marginLeft = 50;
  const contentWidth = doc.page.width - marginLeft * 2;
  const colWidths = {
    order: 44,
    performer: 110,
    programName: 140,
    hostScript: contentWidth - 44 - 110 - 140
  };

  const drawLine = (y) => {
    doc.moveTo(marginLeft, y).lineTo(marginLeft + contentWidth, y).strokeColor('#DDDDDD').stroke();
  };

  const ensurePageSpace = (nextRowHeight, currentY) => {
    const bottomSafeY = doc.page.height - 60;
    if (currentY + nextRowHeight <= bottomSafeY) {
      return currentY;
    }

    doc.addPage();
    return 50;
  };

  const drawHeader = (startY) => {
    doc.fontSize(20).fillColor('#222222').text(recordName, marginLeft, startY, { width: contentWidth, align: 'left' });
    doc
      .fontSize(11)
      .fillColor('#666666')
      .text(`Export time: ${new Date().toLocaleString('en-US')}  ·  Total programs: ${list.length}`, marginLeft, startY + 30, {
        width: contentWidth,
        align: 'left'
      });
  };

  const drawTableHeader = (startY) => {
    doc.fontSize(12).fillColor('#222222');

    let x = marginLeft;
    doc.text('No.', x + 4, startY + 6, { width: colWidths.order - 8 });
    x += colWidths.order;
    doc.text('Performer', x + 4, startY + 6, { width: colWidths.performer - 8 });
    x += colWidths.performer;
    doc.text('Program', x + 4, startY + 6, { width: colWidths.programName - 8 });
    x += colWidths.programName;
    doc.text('Host script', x + 4, startY + 6, { width: colWidths.hostScript - 8 });

    drawLine(startY + 26);
    return startY + 28;
  };

  drawHeader(50);
  let cursorY = drawTableHeader(98);

  list.forEach((track, index) => {
    const rowOrder = String(index + 1);
    const performer = track.performer || '-';
    const programName = track.programName || '-';
    const hostScript = track.hostScript || '-';

    doc.fontSize(11).fillColor('#333333');
    const lineHeight = 16;
    const performerHeight = doc.heightOfString(performer, { width: colWidths.performer - 8, lineGap: 2 });
    const programHeight = doc.heightOfString(programName, { width: colWidths.programName - 8, lineGap: 2 });
    const scriptHeight = doc.heightOfString(hostScript, { width: colWidths.hostScript - 8, lineGap: 2 });
    const orderHeight = doc.heightOfString(rowOrder, { width: colWidths.order - 8, lineGap: 2 });
    const rowHeight = Math.max(lineHeight, performerHeight, programHeight, scriptHeight, orderHeight) + 10;

    cursorY = ensurePageSpace(rowHeight + 2, cursorY);
    if (cursorY === 50) {
      cursorY = drawTableHeader(50);
    }

    let x = marginLeft;
    doc.text(rowOrder, x + 4, cursorY + 4, { width: colWidths.order - 8, lineGap: 2 });
    x += colWidths.order;
    doc.text(performer, x + 4, cursorY + 4, { width: colWidths.performer - 8, lineGap: 2 });
    x += colWidths.performer;
    doc.text(programName, x + 4, cursorY + 4, { width: colWidths.programName - 8, lineGap: 2 });
    x += colWidths.programName;
    doc.text(hostScript, x + 4, cursorY + 4, { width: colWidths.hostScript - 8, lineGap: 2 });

    drawLine(cursorY + rowHeight);
    cursorY += rowHeight + 2;
  });
}

module.exports = {
  findAvailableChineseFontPath,
  renderProgramSheetPdf
};
