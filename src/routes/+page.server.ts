/**
 * +page.server.ts — Route principale : pose de questions sur les règles de jeu.
 *
 * load    : retourne la liste des jeux indexés (pour le sélecteur).
 * actions : reçoit la question, cherche les sections pgvector, appelle le LLM.
 */

// Chargement des variables d'environnement côté serveur
import 'dotenv/config';

import { fail } from '@sveltejs/kit';
import { listGames, findGame } from '../modules/knowledgeBase';
import { retrieveFromBestGame, retrieveForGame } from '../modules/retriever';
import { queryLLM } from '../modules/llmClient';
import { buildContext } from '../modules/contextBuilder';
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
    const question = String(formData.get('question') ?? '').trim();
    const jeuFilter = String(formData.get('jeu') ?? '').trim() || null;

    if (!question) {
      return fail(400, { ok: false as const, error: 'Question manquante.' });
    }

    try {
      const topN = 4;

      // Active l'hybrid search (dense + sparse) pour une meilleure pertinence
      const useHybrid = true;

      const selection = jeuFilter
        ? await retrieveForGame(question, jeuFilter, topN, { useHybrid })
        : await retrieveFromBestGame(question, topN, 0.1, { useHybrid });

      if (!selection || selection.sections.length === 0) {
        return fail(404, {
          ok: false as const,
          error: 'Aucune section pertinente trouvée pour cette question.',
        });
      }

      // Récupère les métadonnées du jeu pour enrichir le contexte
      const gameEntry = await findGame(selection.jeu_id);
      const gameMetadata = gameEntry?.metadata;

      // Construit le contexte enrichi avec toutes les métadonnées disponibles
      const context = buildContext(selection.sections, selection.jeu, {
        format: 'enriched', // ou 'compact' pour un format plus concis
        gameMetadata,
      });

      const llm = await queryLLM(question, context);

      return {
        ok: true as const,
        jeu: selection.jeu,
        jeu_id: selection.jeu_id,
        matchedName: selection.matchedName,
        answer: llm.answer,
        used_llm: llm.used_llm,
        model: llm.model,
        fichier: gameEntry?.fichier ?? null,
        sections: selection.sections.map((s) => ({
          titre: s.section.titre,
          type_section: s.section.type_section,
          resume: s.section.resume,
          contenu: s.section.contenu,
          score: s.score,
          page_debut: s.section.page_debut ?? null,
          page_fin: s.section.page_fin ?? null,
        })),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(500, { ok: false as const, error: msg });
    }
  },
};
