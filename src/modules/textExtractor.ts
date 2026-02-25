/**
 * textExtractor.ts
 * Extrait le texte brut depuis un fichier PDF ou TXT.
 * Supporte : .txt, .md, .pdf
 */

import fs from 'node:fs';
import path from 'node:path';
import { PDFParse, type PageTextResult } from 'pdf-parse';

/**
 * Normalise le texte extrait d'un PDF.
 *
 * Deux transformations sont appliquées dans l'ordre :
 *   1. Césures typographiques — les PDFs encodent parfois les mots longs
 *      avec un trait d'union suivi d'un saut de ligne :
 *        "Mar-\nhandises" → "Marchandises"
 *   2. Sauts de ligne mid-phrase — les colonnes étroites génèrent des
 *      retours à la ligne à l'intérieur d'une phrase. Une ligne qui ne
 *      termine pas par [.!?] et dont la suivante commence par une
 *      minuscule est considérée comme une continuation :
 *        "Le joueur se déplace d'une case\nvers la droite"
 *        → "Le joueur se déplace d'une case vers la droite"
 */
function normalizePageText(text: string): string {
  // 1. Supprime les traits d'union de cesarure en fin de ligne
  let r = text.replace(/(\w)-\n(\w)/g, '$1$2');
  // 2. Joint les lignes de continuation (début par une minuscule)
  r = r.replace(/([^.!?\n])\n(?=[a-zàâäéèêëîïôùûüç])/g, '$1 ');
  return r;
}

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
  return result.pages.map((p) => ({ ...p, text: normalizePageText(p.text) }));
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
