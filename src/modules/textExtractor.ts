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
 * Chaque page est précédée d'un marqueur %%PAGE:N%% pour que le parseur
 * de sections puisse associer chaque section à son numéro de page.
 * pdf-parse est importé dynamiquement pour éviter son effet de bord
 * au chargement (il tente de lire un fichier de test).
 */
async function extractFromPdf(filePath: string): Promise<string> {
  // Dynamic import keeps pdf-parse lazy (avoids its load-time side effect of
  // reading a test file). The default export is the parse function in ESM.
  const { default: pdfParse } = await import('pdf-parse') as {
    default: (
      buffer: Buffer,
      options?: { pagerender?: (pageData: any) => Promise<string> },
    ) => Promise<{ text: string }>;
  };

  const buffer = fs.readFileSync(filePath);

  let pageNum = 0;

  // Réplique le rendu par défaut de pdf-parse en ajoutant un marqueur de page.
  const pagerender = async (pageData: any): Promise<string> => {
    pageNum++;
    const textContent: { items: Array<{ str: string; transform: number[] }> } =
      await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });

    let lastY: number | undefined;
    let text = '';
    for (const item of textContent.items) {
      if (lastY === item.transform[5] || lastY === undefined) {
        text += item.str;
      } else {
        text += '\n' + item.str;
      }
      lastY = item.transform[5];
    }
    return `%%PAGE:${pageNum}%%\n${text}\n`;
  };

  const data = await pdfParse(buffer, { pagerender });
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
