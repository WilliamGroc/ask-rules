import type { PageServerLoad, Actions } from './$types';
import { listGames, removeGame, summarizeKB } from '../../../modules/knowledgeBase';
import { fail } from '@sveltejs/kit';
import pool from '../../../modules/db';

export const load: PageServerLoad = async () => {
  const games = await listGames();
  const summary = await summarizeKB();

  // Récupère les statistiques détaillées pour chaque jeu
  const gamesWithStats = await Promise.all(
    games.map(async (game) => {
      const res = await pool.query(
        'SELECT COUNT(*) as sections, metadata, statistiques, date_ajout FROM games LEFT JOIN sections ON games.id = sections.game_id WHERE games.id = $1 GROUP BY games.id',
        [game.id]
      );

      const stats = res.rows[0];
      return {
        ...game,
        sectionsCount: parseInt(stats?.sections || '0', 10),
        metadata: stats?.metadata || {},
        statistiques: stats?.statistiques || {},
        date_ajout: stats?.date_ajout,
      };
    })
  );

  return {
    games: gamesWithStats,
    summary,
  };
};

export const actions = {
  delete: async ({ request }) => {
    const formData = await request.formData();
    const gameId = formData.get('gameId') as string;

    if (!gameId) {
      return fail(400, { error: 'ID du jeu manquant' });
    }

    try {
      await removeGame(gameId);
      return { success: true, message: `Jeu ${gameId} supprimé avec succès` };
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      return fail(500, { error: 'Erreur lors de la suppression du jeu' });
    }
  },
} satisfies Actions;
