// Report export to Excel (.xlsx), PDF and Word (.docx).
// Libraries are loaded on demand so they don't bloat the initial bundle.

export type ReportCell = string | number;

export interface ReportColumn {
  header: string;
  /** Approximate width in characters */
  width?: number;
}

export interface Report {
  title: string;
  subtitle?: string;
  summary?: { label: string; value: ReportCell }[];
  columns: ReportColumn[];
  rows: ReportCell[][];
}

export type ExportFormat = 'xlsx' | 'pdf' | 'docx';

const ORG = 'Fellowship Portal';
const NAVY = '#002B6B';
const NAVY_LIGHT = '#EEF3FB';

function generatedAt() {
  return new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function reportFileName(title: string, ext: ExportFormat) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportExcel(report: Report, fileName: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const span = Math.max(report.columns.length, 1);

  const meta = [
    [{ value: report.title, fontWeight: 'bold' as const, fontSize: 14, textColor: NAVY, columnSpan: span }],
    [{ value: [report.subtitle, `Generated ${generatedAt()}`].filter(Boolean).join(' · '), textColor: '#64748B', columnSpan: span }],
    ...(report.summary ?? []).map((s) => [{ value: s.label, fontWeight: 'bold' as const }, s.value]),
    [],
  ];

  const header = report.columns.map((c) => ({
    value: c.header,
    fontWeight: 'bold' as const,
    textColor: '#FFFFFF',
    backgroundColor: NAVY,
    borderStyle: 'thin' as const,
    borderColor: '#CBD5E1',
  }));

  const body = report.rows.map((row, i) =>
    row.map((cell) => ({
      value: cell,
      type: typeof cell === 'number' ? Number : String,
      backgroundColor: i % 2 === 1 ? NAVY_LIGHT : undefined,
      borderStyle: 'thin' as const,
      borderColor: '#E2E8F0',
      wrap: true,
      alignVertical: 'top' as const,
    })),
  );

  await writeXlsxFile([...meta, header, ...body], {
    sheet: report.title.slice(0, 31),
    columns: report.columns.map((c) => ({ width: c.width ?? Math.max(12, c.header.length + 2) })),
    stickyRowsCount: meta.length + 1,
  }).toFile(fileName);
}

async function exportPdf(report: Report, fileName: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const landscape = report.columns.length > 5;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;

  doc.setFillColor(NAVY);
  doc.rect(0, 0, pageWidth, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(NAVY);
  doc.text(report.title, margin, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor('#64748B');
  doc.text([ORG, report.subtitle, `Generated ${generatedAt()}`].filter(Boolean).join('  ·  '), margin, 54);

  let y = 70;
  if (report.summary?.length) {
    doc.setFontSize(10);
    const line = report.summary.map((s) => `${s.label}: ${s.value}`).join('     ');
    const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2);
    doc.setTextColor('#0A1628');
    doc.text(wrapped, margin, y);
    y += wrapped.length * 13 + 6;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 40 },
    head: [report.columns.map((c) => c.header)],
    body: report.rows.map((r) => r.map((c) => String(c))),
    styles: { fontSize: 8.5, cellPadding: 5, overflow: 'linebreak', valign: 'top', textColor: '#0A1628', lineColor: '#E2E8F0', lineWidth: 0.5 },
    headStyles: { fillColor: NAVY, textColor: '#FFFFFF', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: NAVY_LIGHT },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor('#94A3B8');
      doc.text(`${report.title} — page ${doc.getNumberOfPages()}`, margin, pageHeight - 20);
    },
  });

  doc.save(fileName);
}

async function exportWord(report: Report, fileName: string) {
  const {
    AlignmentType, Document, HeadingLevel, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
  } = await import('docx');

  const landscape = report.columns.length > 5;
  const hex = (c: string) => c.replace('#', '');
  const totalWidth = report.columns.reduce((n, c) => n + (c.width ?? 14), 0);

  const cell = (text: string, opts: { header?: boolean; shade?: boolean; width: number }) =>
    new TableCell({
      width: { size: Math.round((opts.width / totalWidth) * 100), type: WidthType.PERCENTAGE },
      shading: opts.header
        ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(NAVY) }
        : opts.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(NAVY_LIGHT) } : undefined,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: opts.header, color: opts.header ? 'FFFFFF' : '0A1628', size: 18 })] })],
    });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: report.columns.map((c) => cell(c.header, { header: true, width: c.width ?? 14 })),
      }),
      ...report.rows.map((row, i) =>
        new TableRow({
          children: row.map((v, j) => cell(String(v), { shade: i % 2 === 1, width: report.columns[j]?.width ?? 14 })),
        }),
      ),
    ],
  });

  const doc = new Document({
    creator: ORG,
    title: report.title,
    sections: [{
      properties: landscape ? { page: { size: { orientation: PageOrientation.LANDSCAPE } } } : {},
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: report.title, color: hex(NAVY), bold: true })] }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: [ORG, report.subtitle, `Generated ${generatedAt()}`].filter(Boolean).join('  ·  '), color: '64748B', size: 18 })],
        }),
        ...(report.summary ?? []).map((s) =>
          new Paragraph({ children: [new TextRun({ text: `${s.label}: `, bold: true, size: 20 }), new TextRun({ text: String(s.value), size: 20 })] }),
        ),
        new Paragraph({ text: '', spacing: { after: 120 } }),
        report.rows.length
          ? table
          : new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No records for this period.', italics: true })] }),
      ],
    }],
  });

  downloadBlob(await Packer.toBlob(doc), fileName);
}

export async function exportReport(report: Report, format: ExportFormat) {
  const fileName = reportFileName(report.title, format);
  if (format === 'xlsx') await exportExcel(report, fileName);
  else if (format === 'pdf') await exportPdf(report, fileName);
  else await exportWord(report, fileName);
  return fileName;
}
