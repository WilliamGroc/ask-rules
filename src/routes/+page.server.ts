/**
 * +page.server.ts — Route principale : pose de questions sur les règles de jeu.
 *
 * load    : retourne la liste des jeux indexés (pour le sélecteur).
 * actions : reçoit la question, cherche les sections pgvector, appelle le LLM.
 *           Utilise le cache Redis pour éviter les appels LLM répétitifs.
 */

// Chargement des variables d'environnement côté serveur
import 'dotenv/config';

import { fail } from '@sveltejs/kit';
import { listGames, findGame } from '../modules/knowledgeBase';
import { retrieveFromBestGame, retrieveForGame } from '../modules/retriever';
import { queryLLM } from '../modules/llmClient';
import { buildContext } from '../modules/contextBuilder';
import { getCachedResponse, setCachedResponse } from '../modules/cacheClient';
import type { Actions, PageServerLoad } from './$types';

// ── Load ──────────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async () => {
  const games = await listGames();
  return { games };
};

// ── Configuration ─────────────────────────────────────────────────────────────

const MAX_QUESTION_LENGTH = 500;

// ── Actions ───────────────────────────────────────────────────────────────────

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const question = String(formData.get('question') ?? '').trim();
    const jeuFilter = String(formData.get('jeu') ?? '').trim() || null;

    if (!question) {
      return fail(400, { ok: false as const, error: 'Question manquante.' });
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return fail(400, {
        ok: false as const,
        error: `Question trop longue (${question.length} caractères, maximum ${MAX_QUESTION_LENGTH}).`,
      });
    }

    try {
      // 1. Vérification du cache
      const cached = await getCachedResponse(question, jeuFilter);
      if (cached) {
        return { ok: true as const, ...cached };
      }

      // 2. Cache manquant : récupération des sections pertinentes
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

      // 3. Récupère les métadonnées du jeu pour enrichir le contexte
      const gameEntry = await findGame(selection.jeu_id);
      const gameMetadata = gameEntry?.metadata;

      // 4. Construit le contexte enrichi avec toutes les métadonnées disponibles
      const context = buildContext(selection.sections, selection.jeu, {
        format: 'enriched', // ou 'compact' pour un format plus concis
        gameMetadata,
      });

      // 5. Appel du LLM
      const llm = await queryLLM(question, context);

      // 6. Préparation de la réponse
      const response = {
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

      // 7. Mise en cache de la réponse
      await setCachedResponse(question, jeuFilter, response);

      return {
        ok: true as const,
        ...response,
        cached: false,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(500, { ok: false as const, error: msg });
    }
  },
};
