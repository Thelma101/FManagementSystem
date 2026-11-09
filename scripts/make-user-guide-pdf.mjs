/** Build USER_GUIDE.pdf from USER_GUIDE.md — Living Faith brand colours + fonts. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsPDF } from 'jspdf';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = join(root, 'scripts', 'fonts');
const md = readFileSync(join(root, 'USER_GUIDE.md'), 'utf8');

/** App brand tokens (src/index.css) */
const BLACK = [17, 17, 17];
const RED = [196, 30, 58];
const GOLD = [245, 196, 0];
const MUTED = [51, 51, 51];
const SOFT = [102, 102, 102];
const PAPER = [255, 255, 255];

const FONT_URLS = {
  'Inter-Regular.ttf':
    'https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-400-normal.ttf',
  'Inter-SemiBold.ttf':
    'https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-600-normal.ttf',
  'PlayfairDisplay-Regular.ttf':
    'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@5.2.5/latin-400-normal.ttf',
  'PlayfairDisplay-Bold.ttf':
    'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@5.2.5/latin-700-normal.ttf',
};

async function ensureFonts() {
  mkdirSync(fontDir, { recursive: true });
  for (const [name, url] of Object.entries(FONT_URLS)) {
    const path = join(fontDir, name);
    if (existsSync(path) && readFileSync(path).byteLength > 1000) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Font download failed: ${name} (${res.status})`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
}

function registerFont(doc, file, family, style) {
  const bytes = readFileSync(join(fontDir, file));
  const b64 = bytes.toString('base64');
  doc.addFileToVFS(file, b64);
  doc.addFont(file, family, style);
}

function stripMd(text) {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*/g, '');
}

await ensureFonts();

const doc = new jsPDF({ unit: 'pt', format: 'a4' });
registerFont(doc, 'Inter-Regular.ttf', 'Inter', 'normal');
registerFont(doc, 'Inter-SemiBold.ttf', 'Inter', 'bold');
registerFont(doc, 'PlayfairDisplay-Regular.ttf', 'Playfair', 'normal');
registerFont(doc, 'PlayfairDisplay-Bold.ttf', 'Playfair', 'bold');

const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
const margin = 52;
const maxW = pageW - margin * 2;
let y = margin + 18;
let page = 1;

function paintChrome() {
  // App-style top brand bars (red then gold)
  doc.setFillColor(...RED);
  doc.rect(0, 0, pageW, 5, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 5, pageW, 3, 'F');

  // Soft footer rule
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.line(margin, pageH - 36, pageW - margin, pageH - 36);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text('Living Faith · Lekki Zone Communications', margin, pageH - 22);
  doc.text(String(page), pageW - margin, pageH - 22, { align: 'right' });
}

function newPage() {
  doc.addPage();
  page += 1;
  paintChrome();
  y = margin + 18;
}

function need(extra) {
  if (y + extra > pageH - 52) newPage();
}

function setType(family, style, size, color) {
  doc.setFont(family, style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function writeWrapped(text, { family = 'Inter', style = 'normal', size = 11.5, color = MUTED, leading = 1.45, indent = 0 } = {}) {
  setType(family, style, size, color);
  const lines = doc.splitTextToSize(text, maxW - indent);
  const step = size * leading;
  for (const line of lines) {
    need(step + 2);
    doc.text(line, margin + indent, y);
    y += step;
  }
}

function goldRule() {
  need(16);
  y += 6;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.5);
  doc.line(margin, y, margin + 56, y);
  y += 14;
}

paintChrome();

const lines = md.replace(/\r\n/g, '\n').split('\n');
for (const raw of lines) {
  const line = raw.trimEnd();
  if (!line.trim()) {
    y += 7;
    continue;
  }

  if (line.startsWith('# ')) {
    need(56);
    y += 8;
    writeWrapped(stripMd(line.slice(2)), {
      family: 'Playfair',
      style: 'bold',
      size: 26,
      color: BLACK,
      leading: 1.25,
    });
    y += 4;
    // Gold underline under title
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(2.5);
    doc.line(margin, y, margin + 72, y);
    y += 16;
    continue;
  }

  if (line.startsWith('## ')) {
    goldRule();
    writeWrapped(stripMd(line.slice(3)), {
      family: 'Playfair',
      style: 'bold',
      size: 16,
      color: RED,
      leading: 1.3,
    });
    y += 6;
    continue;
  }

  if (line.startsWith('### ')) {
    y += 10;
    writeWrapped(stripMd(line.slice(4)), {
      family: 'Inter',
      style: 'bold',
      size: 12.5,
      color: BLACK,
      leading: 1.35,
    });
    y += 4;
    continue;
  }

  if (line.startsWith('---')) {
    y += 4;
    continue;
  }

  if (line.startsWith('|') && line.includes('|')) {
    if (/^\|\s*-+/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean).map(stripMd);
    // First cell in red when it looks like a label / role / button name
    need(18);
    const bulletX = margin;
    const textX = margin + 12;
    doc.setFillColor(...GOLD);
    doc.circle(bulletX + 3, y - 3, 2.2, 'F');
    setType('Inter', 'bold', 11, RED);
    const label = cells[0];
    doc.text(label, textX, y);
    const labelW = doc.getTextWidth(label);
    const rest = cells.slice(1).join(' — ');
    if (rest) {
      setType('Inter', 'normal', 11, MUTED);
      const wrapped = doc.splitTextToSize(' — ' + rest, maxW - 12 - labelW);
      // First line continues after label; extra lines indent
      doc.text(wrapped[0], textX + labelW, y);
      y += 11 * 1.4;
      for (let i = 1; i < wrapped.length; i++) {
        need(16);
        doc.text(wrapped[i], textX, y);
        y += 11 * 1.4;
      }
    } else {
      y += 11 * 1.4;
    }
    y += 2;
    continue;
  }

  if (line.startsWith('- ') || line.startsWith('* ')) {
    need(16);
    doc.setFillColor(...RED);
    doc.circle(margin + 3, y - 3, 2, 'F');
    writeWrapped(stripMd(line.slice(2)), {
      size: 11.5,
      color: MUTED,
      indent: 12,
      leading: 1.45,
    });
    y += 2;
    continue;
  }

  if (/^\d+\.\s/.test(line)) {
    const m = line.match(/^(\d+)\.\s(.*)$/);
    const num = m[1];
    const body = stripMd(m[2]);
    need(18);
    // Number pill
    doc.setFillColor(...BLACK);
    doc.circle(margin + 7, y - 3.5, 7, 'F');
    setType('Inter', 'bold', 9, PAPER);
    doc.text(num, margin + 7, y - 0.5, { align: 'center' });
    writeWrapped(body, { size: 11.5, color: MUTED, indent: 22, leading: 1.45 });
    y += 3;
    continue;
  }

  // Tagline / motto emphasis
  const plain = stripMd(line);
  if (/Every Soul Matters|Harvest Field/.test(plain)) {
    writeWrapped(plain, {
      family: 'Playfair',
      style: 'normal',
      size: 13,
      color: RED,
      leading: 1.4,
    });
    y += 4;
    continue;
  }

  writeWrapped(plain, { size: 11.5, color: MUTED, leading: 1.5 });
}

const out = join(root, 'USER_GUIDE.pdf');
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('Wrote', out);
