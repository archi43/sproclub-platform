import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DocumentContent } from "@/lib/documents/content";

/**
 * Render a DocumentContent to a PDF (INC-9). Pure pdf-lib (no native deps, runs
 * on Vercel serverless). Standard fonts keep the bundle light; the brand colour
 * is applied to the title band. Returns the PDF bytes.
 */

// Brand primary #24365E in 0..1 rgb.
const BRAND = rgb(0x24 / 255, 0x36 / 255, 0x5e / 255);
const INK = rgb(0.1, 0.1, 0.1);

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;

/** Wrap a paragraph to a max width in characters (rough, monospace-agnostic). */
function wrap(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderDocumentPdf(content: DocumentContent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(content.title);
  const page = pdf.addPage([A4.width, A4.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = A4.width - 2 * MARGIN;

  // Title band.
  page.drawRectangle({ x: 0, y: A4.height - 96, width: A4.width, height: 96, color: BRAND });
  page.drawText("SproCLUB", { x: MARGIN, y: A4.height - 46, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(content.title, { x: MARGIN, y: A4.height - 74, size: 13, font, color: rgb(1, 1, 1) });

  let y = A4.height - 96 - 40;
  const drawParagraph = (text: string, size = 11, f = font, gap = 8) => {
    for (const line of wrap(text, f, size, contentWidth)) {
      if (y < MARGIN + 60) return; // single page is enough for these documents
      page.drawText(line, { x: MARGIN, y, size, font: f, color: INK });
      y -= size + 4;
    }
    y -= gap;
  };

  for (const p of content.body) drawParagraph(p);

  y = Math.max(y, MARGIN + 60);
  page.drawLine({ start: { x: MARGIN, y: MARGIN + 52 }, end: { x: A4.width - MARGIN, y: MARGIN + 52 }, thickness: 0.5, color: BRAND });
  let fy = MARGIN + 36;
  for (const line of content.footer) {
    for (const wline of wrap(line, font, 9, contentWidth)) {
      page.drawText(wline, { x: MARGIN, y: fy, size: 9, font, color: rgb(0.29, 0.29, 0.29) });
      fy -= 12;
    }
  }

  return pdf.save();
}
