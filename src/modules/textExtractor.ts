/**
 * textExtractor.ts
 * Extrait le texte brut depuis un fichier PDF ou TXT.
 * Supporte : .txt, .md, .pdf
 */

import fs from 'fs';
import path from 'path';

/**
 * Lit un fichier texte brut (.txt, .md, etc.)
 */
function extractFromText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Lit un fichier PDF et retourne le texte extrait.
 * pdf-parse est chargé dynamiquement pour éviter son effet de bord
 * au require (il tente de lire un fichier de test au chargement).
 */
async function extractFromPdf(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Point d'entrée principal : détecte l'extension et délègue à la bonne fonction.
 */
export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return extractFromPdf(filePath);
  }

  if (['.txt', '.md', ''].includes(ext)) {
    return extractFromText(filePath);
  }

  throw new Error(`Extension non supportée : "${ext}". Utilisez .pdf ou .txt`);
}
