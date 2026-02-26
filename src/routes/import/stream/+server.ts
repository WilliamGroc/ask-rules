/**
 * import/stream/+server.ts — Endpoint SSE pour l'import avec progression.
 *
 * Reçoit une requête multipart contenant soit un fichier soit une URL.
 * Émet des événements Server-Sent au fil de l'indexation.
 *
 * Champs FormData :
 *   gameName    string          — nom du jeu (requis)
 *   mode        'replace'|'merge'
 *   importMode  'file'|'url'   — source d'import
 *   fichier     File            — quand importMode === 'file'
 *   url         string          — quand importMode === 'url'
 *
 * Événements émis :
 *   { type: 'step',               message: string }
 *   { type: 'embedding_start',    total: number }
 *   { type: 'embedding_progress', current: number, total: number }
 *   { type: 'done',               jeu, sections, action, mecaniques }
 *   { type: 'error',              message: string }
 */

import 'dotenv/config';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RequestHandler } from './$types';
import {
  openSectionWriter,
  gameExists,
  countSections,
  slugify,
} from '../../../modules/knowledgeBase';
import { generateEmbeddingForSection } from '../../../modules/embedder';
import { analyseFile } from '../../../pipeline';
import { saveUploadedFile } from '../../../modules/fileStorage';
import { validateFile } from '../../../modules/fileValidator';
import { logFileValidationFailed } from '../../../modules/logger';

// ── Helpers URL ───────────────────────────────────────────────────────────────

/**
 * Convertit une page HTML en texte brut :
 * supprime les blocs scripts/styles/nav, remplace les balises structurelles
 * par des sauts de ligne, strip les balises restantes, décode les entités.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Télécharge le contenu d'une URL dans un fichier temporaire.
 * Retourne le chemin du fichier temporaire et le nom de fichier dérivé de l'URL.
 * L'appelant est responsable de supprimer le fichier temporaire.
 */
async function fetchUrlToTemp(url: string): Promise<{ tmpPath: string; filename: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Seules les URLs http:// et https:// sont supportées.');
  }

  const response = await fetch(url, {
    headers: { 'User-Agent': 'ask-rules-bot/1.0' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Le serveur a répondu ${response.status} — ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const urlExt = path.extname(parsed.pathname).toLowerCase();
  const isPdf = contentType.includes('application/pdf') || urlExt === '.pdf';

  let ext: string;
  let content: Buffer;

  if (isPdf) {
    ext = '.pdf';
    content = Buffer.from(await response.arrayBuffer());
  } else if (contentType.includes('text/html') || urlExt === '.html' || urlExt === '.htm') {
    ext = '.txt';
    content = Buffer.from(htmlToText(await response.text()), 'utf-8');
  } else {
    ext = '.txt';
    content = Buffer.from(await response.text(), 'utf-8');
  }

  const tmpPath = path.join(os.tmpdir(), `ask-rules-url-${Date.now()}${ext}`);
  fs.writeFileSync(tmpPath, new Uint8Array(content));

  // Nom de fichier lisible : chemin URL ou hostname
  const basename = path.basename(parsed.pathname).replace(/[?#].*$/, '') || parsed.hostname;
  const filename = basename.endsWith(ext) ? basename : basename + ext;

  return { tmpPath, filename };
}

// ── Handler SSE ───────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let tmpPath: string | null = null;

      try {
        const formData = await request.formData();
        const gameName = String(formData.get('gameName') ?? '').trim();
        const mode = String(formData.get('mode') ?? 'replace') as 'replace' | 'merge';
        const importMode = String(formData.get('importMode') ?? 'file') as 'file' | 'url';

        const gameSlug = slugify(gameName);
        let sourceFilename = '';
        let storedFilePath = '';

        // ── Validation commune ────────────────────────────────────────────────
        if (!gameName) {
          send({ type: 'error', message: 'Le nom du jeu est requis.' });
          return;
        }

        // ── Résolution de la source ───────────────────────────────────────────

        if (importMode === 'url') {
          const urlInput = String(formData.get('url') ?? '').trim();
          if (!urlInput) {
            send({ type: 'error', message: "L'URL est requise." });
            return;
          }

          // Validation format URL
          try {
            new URL(urlInput);
          } catch {
            send({
              type: 'error',
              message: 'URL invalide. Exemple : https://exemple.com/regles.pdf',
            });
            return;
          }

          send({
            type: 'step',
            message: `Téléchargement depuis ${new URL(urlInput).hostname}…`,
          });
          ({ tmpPath, filename: sourceFilename } = await fetchUrlToTemp(urlInput));

          // Sauvegarde permanente du fichier téléchargé
          const urlContent = fs.readFileSync(tmpPath);
          storedFilePath = saveUploadedFile(gameSlug, sourceFilename, urlContent);
        } else {
          // ── Mode fichier (comportement d'origine) ─────────────────────────
          const fichier = formData.get('fichier') as File | null;
          if (!fichier || fichier.size === 0) {
            send({ type: 'error', message: 'Aucun fichier sélectionné.' });
            return;
          }
          const ext = path.extname(fichier.name).toLowerCase();
          if (ext !== '.txt' && ext !== '.pdf') {
            send({
              type: 'error',
              message: 'Format non supporté. Utilisez .txt ou .pdf.',
            });
            return;
          }
          tmpPath = path.join(os.tmpdir(), `ask-rules-${Date.now()}${ext}`);
          const fileContent = new Uint8Array(await fichier.arrayBuffer());
          fs.writeFileSync(tmpPath, fileContent);
          sourceFilename = fichier.name;

          // Sauvegarde permanente du fichier uploadé
          storedFilePath = saveUploadedFile(gameSlug, fichier.name, fileContent);
        }

        // ── Validation du fichier ─────────────────────────────────────────────
        send({ type: 'step', message: 'Validation du fichier…' });

        const validation = await validateFile(tmpPath, {
          strictPdf: true,
          minFrenchScore: 3,
          minBoardGameScore: 3,
        });

        if (!validation.valid) {
          const errorDetails = [
            'Fichier invalide :',
            ...validation.errors,
            '',
            `Détails de l'analyse :`,
            `  • Format PDF : ${validation.details.isPdf ? '✓' : '✗'}`,
            `  • Langue française : ${validation.details.isFrench ? '✓' : '✗'} (score: ${validation.details.frenchScore})`,
            `  • Jeu de société : ${validation.details.isBoardGame ? '✓' : '✗'} (${validation.details.boardGameScore} mots-clés)`,
          ].join('\n');

          // Log l'échec de validation
          await logFileValidationFailed(sourceFilename, validation.errors, validation.details);

          send({ type: 'error', message: errorDetails });
          return;
        }

        if (validation.warnings.length > 0) {
          for (const warning of validation.warnings) {
            send({ type: 'step', message: `⚠️ ${warning}` });
          }
        }

        // ── Extraction + NLP ──────────────────────────────────────────────────
        send({ type: 'step', message: 'Extraction du texte…' });
        const result = await analyseFile(tmpPath, {
          withEmbed: false,
          withChunking: true,
        });
        result.jeu = gameName;

        const n = result.sections.length;
        send({
          type: 'step',
          message: `Analyse NLP — ${n} section${n > 1 ? 's' : ''} détectée${n > 1 ? 's' : ''}`,
        });

        const alreadyExists = await gameExists(gameSlug);
        const isMerge = mode === 'merge' && alreadyExists;
        const idOffset = isMerge ? await countSections(gameSlug) : 0;

        // ── Embeddings + sauvegarde en flux ───────────────────────────────────
        // Chaque section est insérée en base dès que son embedding est prêt,
        // évitant d'accumuler n embeddings × 384 floats en mémoire.
        send({ type: 'embedding_start', total: n });

        const writer = await openSectionWriter(
          gameSlug,
          {
            jeu: gameName,
            fichier: storedFilePath,
            date_ajout: new Date().toISOString(),
            metadata: result.metadata,
            statistiques: result.statistiques,
          },
          isMerge
        );

        let insertedCount = 0;
        try {
          for (let i = 0; i < n; i++) {
            send({ type: 'embedding_progress', current: i + 1, total: n });
            const embedding = await generateEmbeddingForSection(result.sections[i]);
            await writer.insertSection({
              ...result.sections[i],
              section_id: `${gameSlug}_${idOffset + i}`,
              embedding,
            });
            insertedCount++;
          }
          await writer.commit();
        } catch (err) {
          await writer.rollback();
          throw err;
        }

        const actionLabel = isMerge ? 'fusionné' : alreadyExists ? 'remplacé' : 'ajouté';

        send({
          type: 'done',
          jeu: gameName,
          sections: insertedCount,
          action: actionLabel,
          mecaniques: result.statistiques.mecaniques_detectees,
        });
      } catch (e) {
        send({
          type: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        if (tmpPath) {
          try {
            fs.unlinkSync(tmpPath);
          } catch {
            /* ignore */
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
