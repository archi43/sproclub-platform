import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DocumentContent } from "@/lib/documents/content";
import { COLORS } from "@/lib/design-tokens";

/**
 * Render a DocumentContent to a PDF (INC-9). Pure pdf-lib (no native deps, runs
 * on Vercel serverless). Returns the PDF bytes.
 *
 * Design system SproClub : bandeau en Dark Navy (règle 1), filet terracotta,
 * corps en Dark Navy. Les polices standard de pdf-lib tiennent lieu des replis
 * officiels : Times Bold pour Cardo (titres), Helvetica pour Syne et Inter.
 * Embarquer les vraies polices demanderait fontkit et les fichiers statiques :
 * à faire le jour où ces documents deviennent des supports de marque à part.
 */

/** Jeton hexadécimal → couleur pdf-lib : aucune couleur n'est réécrite ici. */
function tokenRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const BAND = tokenRgb(COLORS.brand.deep);
const ACCENT = tokenRgb(COLORS.accent.DEFAULT);
const INK = tokenRgb(COLORS.ink);
const MUTED = tokenRgb(COLORS.muted);
const WHITE = tokenRgb("#ffffff");

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
  const display = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const contentWidth = A4.width - 2 * MARGIN;

  // Title band.
  page.drawRectangle({ x: 0, y: A4.height - 96, width: A4.width, height: 96, color: BAND });
  page.drawRectangle({ x: MARGIN, y: A4.height - 30, width: 19, height: 2, color: ACCENT });
  page.drawText("SproCLUB", { x: MARGIN, y: A4.height - 52, size: 20, font: display, color: WHITE });
  page.drawText(content.title, { x: MARGIN, y: A4.height - 76, size: 13, font, color: WHITE });

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
  page.drawLine({ start: { x: MARGIN, y: MARGIN + 52 }, end: { x: A4.width - MARGIN, y: MARGIN + 52 }, thickness: 0.5, color: ACCENT });
  let fy = MARGIN + 36;
  for (const line of content.footer) {
    for (const wline of wrap(line, font, 9, contentWidth)) {
      page.drawText(wline, { x: MARGIN, y: fy, size: 9, font, color: MUTED });
      fy -= 12;
    }
  }

  return pdf.save();
}
