/**
 * textExtractor.ts
 * Extrait le texte brut depuis un fichier PDF ou TXT.
 * Supporte : .txt, .md, .pdf
 */

import fs from 'fs';
import path from 'path';
import { PDFParse, type PageTextResult } from 'pdf-parse';

/**
 * Lit un fichier PDF et retourne le texte extrait page par page.
 * Chaque PageTextResult contient { num, text } sans marqueurs — ceux-ci
 * sont ajoutés en aval dans le pipeline (%%PAGE:N%%).
 *
 * pdf-parse utilise PDF.js getTextContent() — aucune dépendance canvas.
 */
async function extractFromPdf(filePath: string): Promise<PageTextResult[]> {
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);

  const parser = new PDFParse({ data });
  const result = await parser.getText({ pageJoiner: '\n%%PAGE:page_number%%' });
  await parser.destroy();

  console.log(`[textExtractor] Extraction PDF terminée : ${result.total} caractères extraits.`);
  return result.pages;
}

/**
 * Point d'entrée principal : détecte l'extension et délègue à la bonne fonction.
 * Pour les fichiers texte, retourne une seule "page" avec num = 1.
 */
export async function extractText(filePath: string): Promise<PageTextResult[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return extractFromPdf(filePath);
  }

  if (['.txt', '.md', ''].includes(ext)) {
    return [{ num: 1, text: fs.readFileSync(filePath, 'utf-8') }];
  }

  throw new Error(`Extension non supportée : "${ext}". Utilisez .pdf ou .txt`);
}
