/**
 * import/+page.server.ts — Route d'importation de règles de jeu.
 *
 * load    : retourne la liste des jeux indexés (pour le sélecteur).
 */

import 'dotenv/config';
import { listGames } from '../../modules/knowledgeBase';
import type { PageServerLoad } from './$types';

// ── Load ──────────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async () => {
  const games = await listGames();
  return { games };
};
