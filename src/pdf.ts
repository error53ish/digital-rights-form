import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { CREATION_METHODS, LICENSE_TYPES, PERMISSIONS, PROHIBITIONS, type RightsForm } from './types';

const PAGE_SIZES = { letter: [612, 792], a4: [595.28, 841.89] } as const;
const MARGIN = 54;
const FOOTER_SPACE = 30;
const LABEL_WIDTH = 128;

const INK = rgb(0.11, 0.11, 0.14);
const MUTED = rgb(0.42, 0.42, 0.47);
const ACCENT = rgb(0.27, 0.22, 0.58);
const RULE = rgb(0.84, 0.84, 0.88);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

interface TextOptions {
  font?: PDFFont;
  size?: number;
  color?: ReturnType<typeof rgb>;
  x?: number;
  width?: number;
  lineHeight?: number;
}

/** Tracks the write position and starts new pages as content flows. */
class Layout {
  page!: PDFPage;
  y = 0;
  readonly pages: PDFPage[] = [];
  readonly left = MARGIN;
  readonly contentWidth: number;
  private readonly charset: Set<number>;

  constructor(
    private readonly doc: PDFDocument,
    private readonly size: readonly [number, number],
    readonly fonts: Fonts,
  ) {
    this.contentWidth = size[0] - MARGIN * 2;
    this.charset = new Set(fonts.regular.getCharacterSet());
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([this.size[0], this.size[1]]);
    this.pages.push(this.page);
    this.y = this.size[1] - MARGIN;
  }

  /** Starts a new page if fewer than `height` points remain. */
  ensure(height: number) {
    if (this.y - height < MARGIN + FOOTER_SPACE) this.addPage();
  }

  /** The standard PDF fonts only cover WinAnsi; replace anything they can't draw. */
  clean(text: string): string {
    let out = '';
    for (const ch of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')) {
      const code = ch.codePointAt(0)!;
      if (ch === '\n' || this.charset.has(code)) {
        out += ch;
        continue;
      }
      const stripped = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      // Drop what the font can't draw (emoji, non-Latin scripts) rather than printing '?'.
      if ([...stripped].every((c) => this.charset.has(c.codePointAt(0)!))) out += stripped;
    }
    return out.replace(/ {2,}/g, ' ').replace(/ +$/gm, '');
  }

  wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxWidth;
    const lines: string[] = [];
    for (const paragraph of this.clean(text).split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push('');
        continue;
      }
      let line = '';
      for (let word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (fits(candidate)) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        while (!fits(word)) {
          let cut = word.length - 1;
          while (cut > 1 && !fits(word.slice(0, cut))) cut--;
          lines.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        line = word;
      }
      lines.push(line);
    }
    return lines;
  }

  /** Draws wrapped text at the current position and advances past it. */
  text(text: string, opts: TextOptions = {}) {
    const font = opts.font ?? this.fonts.regular;
    const size = opts.size ?? 10;
    const x = opts.x ?? this.left;
    const width = opts.width ?? this.contentWidth - (x - this.left);
    const lineHeight = opts.lineHeight ?? size * 1.4;
    for (const line of this.wrap(text, font, size, width)) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, { x, y: this.y + (lineHeight - size) / 2, size, font, color: opts.color ?? INK });
    }
  }

  gap(points: number) {
    this.y -= points;
  }

  rule(color = RULE, thickness = 0.75) {
    this.page.drawLine({
      start: { x: this.left, y: this.y },
      end: { x: this.left + this.contentWidth, y: this.y },
      thickness,
      color,
    });
  }

  /** Section heading; keeps at least `keepWith` points of room for the content that follows. */
  heading(title: string, keepWith = 90) {
    this.ensure(keepWith);
    this.gap(18);
    this.text(title.toUpperCase(), { font: this.fonts.bold, size: 10, color: ACCENT, lineHeight: 14 });
    this.gap(4);
    this.rule();
    this.gap(6);
  }

  /** A label / value row. Empty values are skipped. */
  field(label: string, value: string, width = this.contentWidth) {
    if (!value.trim()) return;
    const size = 10;
    const lineHeight = 14;
    const valueWidth = width - LABEL_WIDTH;
    const lines = this.wrap(value, this.fonts.regular, size, valueWidth);
    this.ensure(lineHeight);
    this.page.drawText(this.clean(label), {
      x: this.left,
      y: this.y - lineHeight + 3,
      size: 8.5,
      font: this.fonts.bold,
      color: MUTED,
    });
    for (const line of lines) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, { x: this.left + LABEL_WIDTH, y: this.y + 3, size, font: this.fonts.regular, color: INK });
    }
    this.gap(3);
  }

  /** A bulleted list item with a drawn check or cross marker. */
  mark(text: string, allowed: boolean) {
    const indent = 18;
    const lines = this.wrap(text, this.fonts.regular, 10, this.contentWidth - indent);
    this.ensure(14);
    const boxY = this.y - 11;
    const box = { x: this.left + 2, y: boxY, width: 9, height: 9 };
    this.page.drawRectangle({ ...box, borderColor: allowed ? ACCENT : MUTED, borderWidth: 0.8 });
    const c = allowed ? ACCENT : MUTED;
    if (allowed) {
      this.page.drawLine({ start: { x: box.x + 2, y: boxY + 4.5 }, end: { x: box.x + 4, y: boxY + 2 }, thickness: 1.2, color: c });
      this.page.drawLine({ start: { x: box.x + 4, y: boxY + 2 }, end: { x: box.x + 7.5, y: boxY + 7.5 }, thickness: 1.2, color: c });
    } else {
      this.page.drawLine({ start: { x: box.x + 2, y: boxY + 2 }, end: { x: box.x + 7, y: boxY + 7 }, thickness: 1, color: c });
      this.page.drawLine({ start: { x: box.x + 2, y: boxY + 7 }, end: { x: box.x + 7, y: boxY + 2 }, thickness: 1, color: c });
    }
    this.text(lines.join('\n'), { x: this.left + indent, lineHeight: 14 });
    this.gap(2);
  }
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function rightsStatement(form: RightsForm): string {
  const artist = form.artist.name || 'The artist';
  const holder = form.recipient.name || form.recipient.organization || 'the holder of this certificate';
  const parties = `${artist} (the "Artist") `;
  switch (form.license.type) {
    case 'personal':
      return `${parties}grants ${holder} (the "Holder") a non-exclusive, non-transferable license to use the artwork described above for personal, non-commercial purposes, subject to the permissions and restrictions below. The Artist retains all copyright in the artwork.`;
    case 'commercial':
      return `${parties}grants ${holder} (the "Holder") a non-exclusive license to use the artwork described above for personal and commercial purposes, subject to the permissions and restrictions below. The Artist retains all copyright in the artwork and may license it to others.`;
    case 'exclusive':
      return `${parties}grants ${holder} (the "Holder") an exclusive license to use the artwork described above, subject to the permissions and restrictions below. For the term of this license the Artist will not license the artwork to any other party. The Artist retains copyright in the artwork and may display it in their portfolio.`;
    case 'transfer':
      return `${parties}assigns and transfers to ${holder} (the "Holder") all copyright in the artwork described above, including the exclusive rights to reproduce, distribute, display, and create derivative works from it. The Artist keeps the right to be credited as the creator and to display the artwork in their portfolio.`;
  }
}

function authenticityStatement(form: RightsForm): string {
  const artist = form.artist.name || 'the artist';
  const disclosure =
    form.artwork.creationMethod === 'ai-assisted'
      ? ' with the assistance of the generative AI tools listed above'
      : form.artwork.creationMethod === 'ai-generated'
        ? ' using the generative AI tools listed above'
        : '';
  return `I, ${artist}, certify that the artwork described in this document is an original work created by me${disclosure}, that it is the work identified by the file fingerprint above, and that I have the right to grant the rights described in this document.`;
}

async function embed(doc: PDFDocument, image: { bytes: Uint8Array; kind: 'png' | 'jpg' }): Promise<PDFImage> {
  return image.kind === 'png' ? doc.embedPng(image.bytes) : doc.embedJpg(image.bytes);
}

export async function generatePdf(form: RightsForm): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const L = new Layout(doc, PAGE_SIZES[form.pageSize], fonts);
  const title = form.artwork.title || 'Untitled';

  doc.setTitle(`Certificate of Authenticity: ${L.clean(title)}`);
  doc.setAuthor(L.clean(form.artist.name));
  doc.setSubject('Certificate of authenticity and digital rights statement');
  doc.setKeywords([form.certificateId, form.artwork.fileHash].filter(Boolean));
  doc.setCreator('Digital Rights Form');

  // Header
  const headerTop = L.y;
  L.text('Certificate of Authenticity', { font: fonts.bold, size: 22, lineHeight: 28, width: L.contentWidth - 170 });
  L.text('& Digital Rights Statement', { font: fonts.regular, size: 13, color: MUTED, lineHeight: 18 });
  const metaX = L.left + L.contentWidth - 160;
  const meta: [string, string][] = [
    ['CERTIFICATE NO.', form.certificateId],
    ['ISSUED', formatDate(form.issueDate)],
  ];
  meta.forEach(([label, value], i) => {
    const y = headerTop - 12 - i * 24;
    L.page.drawText(label, { x: metaX, y, size: 7.5, font: fonts.bold, color: MUTED });
    L.page.drawText(L.clean(value), { x: metaX, y: y - 11, size: 10, font: fonts.regular, color: INK });
  });
  L.gap(14);
  L.rule(ACCENT, 2);
  L.gap(4);

  // Artwork
  L.heading('Artwork');
  let imageBottom = L.y;
  let fieldWidth = L.contentWidth;
  if (form.artwork.preview) {
    const image = await embed(doc, form.artwork.preview);
    const { width, height } = image.scaleToFit(150, 150);
    L.ensure(height + 10);
    const x = L.left + L.contentWidth - width;
    const y = L.y - height - 4;
    L.page.drawImage(image, { x, y, width, height });
    L.page.drawRectangle({ x, y, width, height, borderColor: RULE, borderWidth: 0.75 });
    imageBottom = y - 8;
    fieldWidth = L.contentWidth - width - 16;
  }
  const artworkPage = L.page;
  L.field('Title', title, fieldWidth);
  L.field('Edition', form.artwork.edition, fieldWidth);
  L.field('Date created', formatDate(form.artwork.dateCreated), fieldWidth);
  L.field('Medium / format', form.artwork.medium, fieldWidth);
  L.field('Dimensions', form.artwork.dimensions, fieldWidth);
  L.field('Creation method', CREATION_METHODS[form.artwork.creationMethod], fieldWidth);
  L.field('Tools used', form.artwork.toolsUsed, fieldWidth);
  L.field('Source file', form.artwork.fileName, fieldWidth);
  L.field('SHA-256 fingerprint', form.artwork.fileHash, fieldWidth);
  if (L.page === artworkPage) L.y = Math.min(L.y, imageBottom);
  if (form.artwork.description.trim()) {
    L.gap(4);
    L.text(form.artwork.description, { size: 10, lineHeight: 14, color: INK });
  }

  // Parties
  L.heading('Artist');
  L.field('Name', [form.artist.name, form.artist.alias && `(${form.artist.alias})`].filter(Boolean).join(' '));
  L.field('Email', form.artist.email);
  L.field('Website', form.artist.website);

  L.heading('Issued to');
  const hasRecipient = form.recipient.name || form.recipient.organization || form.recipient.email;
  if (hasRecipient) {
    L.field('Name', form.recipient.name);
    L.field('Organization', form.recipient.organization);
    L.field('Email', form.recipient.email);
  } else {
    L.text('The holder of this certificate', { color: MUTED });
  }

  // Rights
  L.heading('Rights granted', 140);
  L.text(LICENSE_TYPES[form.license.type], { font: fonts.bold, size: 11, lineHeight: 16 });
  L.gap(2);
  L.text(rightsStatement(form), { lineHeight: 14 });
  L.gap(8);

  const allowed = Object.keys(PERMISSIONS).filter((k) => form.license.permissions.includes(k));
  const notAllowed = Object.keys(PERMISSIONS).filter((k) => !form.license.permissions.includes(k));
  const prohibited = Object.keys(PROHIBITIONS).filter((k) => form.license.prohibitions.includes(k));

  if (allowed.length) {
    L.ensure(40);
    L.text('The Holder MAY:', { font: fonts.bold, size: 9, color: MUTED });
    L.gap(2);
    allowed.forEach((k) => L.mark(PERMISSIONS[k], true));
    L.gap(6);
  }
  if (notAllowed.length || prohibited.length) {
    L.ensure(40);
    L.text('The Holder may NOT:', { font: fonts.bold, size: 9, color: MUTED });
    L.gap(2);
    notAllowed.forEach((k) => L.mark(PERMISSIONS[k], false));
    prohibited.forEach((k) => L.mark(PROHIBITIONS[k], false));
    L.gap(6);
  }

  L.field('Territory', form.license.territory);
  L.field('Term', form.license.term);
  L.field('Attribution', form.license.attribution);
  if (form.license.additionalTerms.trim()) {
    L.gap(4);
    L.text('Additional terms', { font: fonts.bold, size: 9, color: MUTED });
    L.text(form.license.additionalTerms, { lineHeight: 14 });
  }

  // Authenticity + signatures
  L.heading('Statement of authenticity');
  L.text(authenticityStatement(form), { lineHeight: 14 });

  L.ensure(120);
  L.gap(28);
  const colWidth = (L.contentWidth - 40) / 2;
  const sigLineY = L.y - 56;
  const columns = [
    { x: L.left, label: 'Artist signature', name: form.artist.name, date: formatDate(form.issueDate) },
    { x: L.left + colWidth + 40, label: 'Holder signature (acknowledgement)', name: form.recipient.name, date: '' },
  ];

  if (form.signature.drawn) {
    const sig = await embed(doc, form.signature.drawn);
    const { width, height } = sig.scaleToFit(colWidth - 10, 52);
    L.page.drawImage(sig, { x: L.left + 4, y: sigLineY + 3, width, height });
  } else if (form.signature.typedName.trim()) {
    L.page.drawText(L.clean(form.signature.typedName), { x: L.left + 4, y: sigLineY + 8, size: 20, font: fonts.italic, color: INK });
  }

  for (const col of columns) {
    L.page.drawLine({ start: { x: col.x, y: sigLineY }, end: { x: col.x + colWidth, y: sigLineY }, thickness: 0.75, color: INK });
    L.page.drawText(col.label.toUpperCase(), { x: col.x, y: sigLineY - 12, size: 7.5, font: fonts.bold, color: MUTED });
    if (col.name) L.page.drawText(L.clean(col.name), { x: col.x, y: sigLineY - 25, size: 10, font: fonts.regular, color: INK });
    L.page.drawText(L.clean(col.date ? `Date: ${col.date}` : 'Date: ____________________'), {
      x: col.x,
      y: sigLineY - 39,
      size: 9,
      font: fonts.regular,
      color: MUTED,
    });
  }
  L.y = sigLineY - 45;

  // "Brought to you by" note, centered at the bottom of the last page
  const brandText = 'This form brought to you by Clawmark Prints.';
  const brandSize = 8.5;
  const logoHeight = 32;
  const brandY = MARGIN + 14;
  if (L.y < brandY + logoHeight + 8) L.addPage();
  const brandLogo = form.brandLogo ? await embed(doc, form.brandLogo) : undefined;
  const logoDims = brandLogo ? brandLogo.scaleToFit(logoHeight, logoHeight) : { width: 0, height: 0 };
  const textWidth = fonts.italic.widthOfTextAtSize(brandText, brandSize);
  const gapX = brandLogo ? 6 : 0;
  const startX = L.left + (L.contentWidth - (logoDims.width + gapX + textWidth)) / 2;
  if (brandLogo) L.page.drawImage(brandLogo, { x: startX, y: brandY, ...logoDims });
  L.page.drawText(brandText, {
    x: startX + logoDims.width + gapX,
    y: brandY + (logoDims.height - brandSize) / 2 + 1,
    size: brandSize,
    font: fonts.italic,
    color: MUTED,
  });

  // Footer on every page
  L.pages.forEach((page, i) => {
    const label = `Certificate No. ${form.certificateId}`;
    const pageLabel = `Page ${i + 1} of ${L.pages.length}`;
    page.drawLine({ start: { x: MARGIN, y: MARGIN + 6 }, end: { x: page.getWidth() - MARGIN, y: MARGIN + 6 }, thickness: 0.5, color: RULE });
    page.drawText(L.clean(label), { x: MARGIN, y: MARGIN - 6, size: 8, font: fonts.regular, color: MUTED });
    page.drawText(pageLabel, {
      x: page.getWidth() - MARGIN - fonts.regular.widthOfTextAtSize(pageLabel, 8),
      y: MARGIN - 6,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
  });

  return doc.save();
}
