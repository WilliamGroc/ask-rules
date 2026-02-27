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
import { retrieveFromBestGame, retrieveForGame, retrieveForOverview } from '../modules/retriever';
import { queryLLM } from '../modules/llmClient';
import { buildContext } from '../modules/contextBuilder';
import { getCachedResponse, setCachedResponse } from '../modules/cacheClient';
import { checkRateLimit, getClientIP, isWhitelisted } from '../modules/rateLimiter';
import { detectIntent } from '../modules/intentDetector';
import type { Actions, PageServerLoad } from './$types';

// ── Load ──────────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async () => {
  const games = await listGames();

  // Récupération de la version depuis les variables d'environnement
  const version = process.env.VERSION || '1.0.0';

  return { games, version };
};

// ── Configuration ─────────────────────────────────────────────────────────────

const MAX_QUESTION_LENGTH = 500;

// ── Actions ───────────────────────────────────────────────────────────────────

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const question = String(formData.get('question') ?? '').trim();
    const jeuFilter = String(formData.get('jeu') ?? '').trim() || null;

    // 1. Protection anti-spam : vérification du rate limit
    const clientIP = getClientIP(request.headers);
    const userAgent = request.headers.get('user-agent') ?? undefined;

    if (!isWhitelisted(clientIP)) {
      const rateCheck = checkRateLimit(clientIP, true, userAgent);
      if (!rateCheck.allowed) {
        return fail(429, {
          ok: false as const,
          error: rateCheck.reason ?? 'Trop de requêtes.',
          retryAfter: rateCheck.retryAfter,
        });
      }
    }

    // 2. Validation de la question
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
      // 3. Vérification du cache
      const cached = await getCachedResponse(question, jeuFilter);
      if (cached) {
        return { ok: true as const, ...cached };
      }

      // 4. Détection de l'intention de la question
      const intent = detectIntent(question);
      const isOverview = intent.intent === 'overview';

      // 5. Récupération des sections adaptée à l'intention
      const topN = isOverview ? intent.recommendedSections : 4;
      const useHybrid = true;

      let selection;

      if (isOverview) {
        // Pour les questions de vue d'ensemble, utilise la stratégie spécialisée
        if (jeuFilter) {
          // Résout d'abord le gameId depuis le nom du jeu
          const normalize = (s: string) =>
            s
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '');
          const needle = normalize(jeuFilter);
          const gamesRes = await listGames();
          const match = gamesRes.find((g) => normalize(g.jeu).includes(needle));
          const gameId = match?.id;
          selection = await retrieveForOverview(
            question,
            gameId,
            intent.prioritySections,
            topN
          );
        } else {
          selection = await retrieveForOverview(
            question,
            undefined,
            intent.prioritySections,
            topN
          );
        }
      } else {
        // Pour les questions spécifiques, utilise la recherche standard
        selection = jeuFilter
          ? await retrieveForGame(question, jeuFilter, topN, { useHybrid })
          : await retrieveFromBestGame(question, topN, 0.1, { useHybrid });
      }

      if (!selection || selection.sections.length === 0) {
        return fail(404, {
          ok: false as const,
          error: 'Aucune section pertinente trouvée pour cette question.',
        });
      }

      // 6. Récupère les métadonnées du jeu pour enrichir le contexte
      const gameEntry = await findGame(selection.jeu_id);
      const gameMetadata = gameEntry?.metadata;

      // 7. Construit le contexte adapté à l'intention
      const contextFormat = isOverview ? 'overview' : 'enriched';
      const context = buildContext(selection.sections, selection.jeu, {
        format: contextFormat,
        gameMetadata,
      });

      // 8. Appel du LLM
      const llm = await queryLLM(question, context);

      // 9. Préparation de la réponse
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

      // 10. Mise en cache de la réponse
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
