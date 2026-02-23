/**
 * +page.server.ts — Route principale : pose de questions sur les règles de jeu.
 *
 * load    : retourne la liste des jeux indexés (pour le sélecteur).
 * actions : reçoit la question, cherche les sections pgvector, appelle le LLM.
 */

// Chargement des variables d'environnement côté serveur
import 'dotenv/config';

import { fail } from '@sveltejs/kit';
import { listGames } from '../modules/knowledgeBase';
import { retrieveFromBestGame, retrieveForGame } from '../modules/retriever';
import { queryLLM } from '../modules/llmClient';
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
      const selection = jeuFilter
        ? await retrieveForGame(question, jeuFilter, topN)
        : await retrieveFromBestGame(question, topN);

      if (!selection || selection.sections.length === 0) {
        return fail(404, {
          ok: false as const,
          error: 'Aucune section pertinente trouvée pour cette question.',
        });
      }

      const context = selection.sections
        .map((r, i) =>
          `--- Section ${i + 1} : "${r.section.titre}" [${r.section.type_section}]\n` +
          r.section.contenu.slice(0, 800),
        )
        .join('\n\n');

      const llm = await queryLLM(question, context);

      return {
        ok: true as const,
        jeu: selection.jeu,
        matchedName: selection.matchedName,
        answer: llm.answer,
        used_llm: llm.used_llm,
        model: llm.model,
        sections: selection.sections.map(s => ({
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
