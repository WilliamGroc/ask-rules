/**
 * textExtractor.ts
 * Extrait le texte brut depuis un fichier PDF ou TXT.
 * Supporte : .txt, .md, .pdf
 */

import fs from 'fs';
import path from 'path';
import { PdfReader } from 'pdfreader';

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
 * pdfreader est importé dynamiquement.
 */
async function extractFromPdf(filePath: string): Promise<string> {

  return new Promise((resolve, reject) => {
    const pages: Map<number, Array<{ x: number; y: number; text: string }>> = new Map();
    let currentPage = 0;

    new PdfReader().parseFileItems(filePath, (err, item) => {
      if (err) {
        reject(err);
        return;
      }

      if (!item) {
        // Fin du fichier : construire le texte
        const result: string[] = [];
        const sortedPages = Array.from(pages.keys()).sort((a, b) => a - b);

        for (const pageNum of sortedPages) {
          result.push(`%%PAGE:${pageNum}%%`);
          const items = pages.get(pageNum)!;

          // Trier par position Y puis X pour gérer les colonnes
          // Grouper les items par ligne (même Y), puis trier par X dans chaque ligne
          items.sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) < 0.1) {
              // Même ligne : trier par X (gauche à droite)
              return a.x - b.x;
            }
            // Lignes différentes : trier par Y (haut en bas)
            return yDiff;
          });

          let lastY: number | undefined;
          let line = '';
          for (const { y, text } of items) {
            // Tolérance pour considérer deux items sur la même ligne
            if (lastY === undefined || Math.abs(y - lastY) < 0.1) {
              // Même ligne : ajouter un espace si nécessaire
              if (line && !line.endsWith(' ') && !text.startsWith(' ')) {
                line += ' ';
              }
              line += text;
            } else {
              // Nouvelle ligne
              if (line.trim()) result.push(line);
              line = text;
            }
            lastY = y;
          }
          if (line.trim()) result.push(line);
        }

        const finalText = result.join('\n');
        // console.log(finalText.substring(0, 1000)); // Debug : affiche les 1000 premiers caractères
        resolve(finalText);
        return;
      }

      if (item.page) {
        currentPage = item.page;
        if (!pages.has(currentPage)) {
          pages.set(currentPage, []);
        }
      }

      if (item.text) {
        pages.get(currentPage)?.push({
          x: item.x || 0,
          y: item.y || 0,
          text: item.text
        });
      }
    });
  });
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
