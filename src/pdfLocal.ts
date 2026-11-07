// src/pdfLocal.ts
// Lit un relevé PDF directement dans le navigateur (pdf.js) : le fichier ne quitte jamais l'appareil.
import { extractStatementTable, type PdfPage, type PdfTable } from "./pdfStatement";

export class PdfPasswordError extends Error {
  constructor() {
    super("PDF protected by a password");
    this.name = "PdfPasswordError";
  }
}

export class PdfUnreadableError extends Error {
  constructor() {
    super("PDF text is unreadable");
    this.name = "PdfUnreadableError";
  }
}

export async function readPdfStatement(file: File): Promise<PdfTable> {
  // chargé à la demande : la bibliothèque (~1 Mo) n'alourdit pas le démarrage de l'app
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    if (e instanceof Error && e.name === "PasswordException") throw new PdfPasswordError();
    throw e;
  }

  const pages: PdfPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const items: PdfPage = [];
    for (const it of content.items) {
      if ("str" in it && it.str.trim() !== "") {
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
      }
    }
    pages.push(items);
  }
  await task.destroy();
  const table = extractStatementTable(pages);
  if (table.rows.length === 0 && !table.readable) throw new PdfUnreadableError();
  return table;
}
