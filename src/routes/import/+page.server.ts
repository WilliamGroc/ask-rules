/**
 * import/+page.server.ts — Route d'importation de règles de jeu.
 *
 * load    : retourne la liste des jeux indexés (pour le sélecteur).
 * actions : reçoit le fichier + nom du jeu, analyse, embed, indexe.
 */

import 'dotenv/config';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fail } from '@sveltejs/kit';
import { listGames, openSectionWriter, gameExists, countSections, slugify } from '../../modules/knowledgeBase';
import { generateEmbedding } from '../../modules/embedder';
import { analyseFile } from '../../pipeline';
import type { Actions, PageServerLoad } from './$types';

// ── Load ──────────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async () => {
  const games = await listGames();
  return { games };
};

// ── Actions ───────────────────────────────────────────────────────────────────

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const gameName = String(formData.get('gameName') ?? '').trim();
    const mode = String(formData.get('mode') ?? 'replace') as 'replace' | 'merge';
    const fichier = formData.get('fichier') as File | null;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!gameName) {
      return fail(400, { ok: false as const, error: 'Le nom du jeu est requis.' });
    }
    if (!fichier || fichier.size === 0) {
      return fail(400, { ok: false as const, error: 'Aucun fichier sélectionné.' });
    }

    const ext = path.extname(fichier.name).toLowerCase();
    if (ext !== '.txt' && ext !== '.pdf') {
      return fail(400, { ok: false as const, error: 'Format non supporté. Utilisez un fichier .txt ou .pdf.' });
    }

    // ── Sauvegarde temporaire ─────────────────────────────────────────────────
    const tmpPath = path.join(os.tmpdir(), `ask-rules-${Date.now()}${ext}`);
    try {
      const buffer = Buffer.from(await fichier.arrayBuffer());
      fs.writeFileSync(tmpPath, buffer);

      // ── Analyse NLP ───────────────────────────────────────────────────────
      const result = await analyseFile(tmpPath, { withEmbed: false });
      result.jeu = gameName;

      const gameSlug = slugify(gameName);
      const alreadyExists = await gameExists(gameSlug);
      const isMerge = mode === 'merge' && alreadyExists;
      const idOffset = isMerge ? await countSections(gameSlug) : 0;

      // ── Génération des embeddings + sauvegarde en flux ──────────────────
      const writer = await openSectionWriter(
        gameSlug,
        {
          jeu: gameName,
          fichier: fichier.name,
          date_ajout: new Date().toISOString(),
          metadata: result.metadata,
          statistiques: result.statistiques,
        },
        isMerge,
      );

      let insertedCount = 0;
      try {
        for (let i = 0; i < result.sections.length; i++) {
          const embedding = await generateEmbedding(result.sections[i].contenu);
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

      const actionLabel = isMerge
        ? 'fusionné'
        : alreadyExists
          ? 'remplacé'
          : 'ajouté';

      return {
        ok: true as const,
        jeu: gameName,
        sections: insertedCount,
        action: actionLabel,
        mecaniques: result.statistiques.mecaniques_detectees,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(500, { ok: false as const, error: msg });
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  },
};
