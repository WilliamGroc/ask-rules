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

  reprocess: async ({ request }) => {
    const formData = await request.formData();
    const gameId = formData.get('gameId') as string;

    if (!gameId) {
      return fail(400, { error: 'ID du jeu manquant' });
    }

    try {
      // Récupère les infos du jeu depuis la base
      const gameRes = await pool.query('SELECT id, jeu, fichier FROM games WHERE id = $1', [
        gameId,
      ]);

      if (gameRes.rows.length === 0) {
        return fail(404, { error: 'Jeu non trouvé' });
      }

      const game = gameRes.rows[0];
      const filePath = game.fichier;

      // Vérifie que le fichier existe
      const fs = await import('node:fs');
      const path = await import('node:path');
      const absolutePath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(absolutePath)) {
        return fail(404, {
          error: `Fichier source introuvable : ${filePath}`,
        });
      }

      // Réexécute le pipeline complet
      const { analyseFile } = await import('../../../pipeline');
      const { upsertGame } = await import('../../../modules/knowledgeBase');
      const { generateEmbeddingForSection } = await import('../../../modules/embedder');

      const result = await analyseFile(absolutePath, {
        withEmbed: false,
        withChunking: true,
      });

      // Génère les embeddings pour toutes les sections
      const sectionsWithEmbeddings = await Promise.all(
        result.sections.map(async (section, i) => {
          const embedding = await generateEmbeddingForSection(section);
          return {
            ...section,
            section_id: `${gameId}_${i}`,
            embedding,
          };
        })
      );

      // Upsert en base (remplace toutes les sections)
      await upsertGame({
        id: gameId,
        jeu: game.jeu,
        fichier: filePath,
        date_ajout: new Date().toISOString(),
        metadata: result.metadata,
        statistiques: result.statistiques,
        sections: sectionsWithEmbeddings,
      });

      return {
        success: true,
        message: `Jeu ${game.jeu} recalculé : ${sectionsWithEmbeddings.length} sections`,
      };
    } catch (error) {
      console.error('Erreur lors du recalcul:', error);
      return fail(500, {
        error: error instanceof Error ? error.message : 'Erreur lors du recalcul',
      });
    }
  },

  reprocessAll: async () => {
    try {
      const games = await listGames();

      if (games.length === 0) {
        return fail(400, { error: 'Aucun jeu à recalculer' });
      }

      const errors: string[] = [];
      let successCount = 0;

      for (const game of games) {
        try {
          // Récupère le fichier
          const gameRes = await pool.query('SELECT fichier FROM games WHERE id = $1', [game.id]);
          const filePath = gameRes.rows[0]?.fichier;

          if (!filePath) {
            errors.push(`${game.jeu}: fichier manquant`);
            continue;
          }

          const fs = await import('node:fs');
          const path = await import('node:path');
          const absolutePath = path.resolve(process.cwd(), filePath);

          if (!fs.existsSync(absolutePath)) {
            errors.push(`${game.jeu}: fichier introuvable`);
            continue;
          }

          // Réexécute le pipeline
          const { analyseFile } = await import('../../../pipeline');
          const { upsertGame } = await import('../../../modules/knowledgeBase');
          const { generateEmbeddingForSection } = await import('../../../modules/embedder');

          const result = await analyseFile(absolutePath, {
            withEmbed: false,
            withChunking: true,
          });

          const sectionsWithEmbeddings = await Promise.all(
            result.sections.map(async (section, i) => {
              const embedding = await generateEmbeddingForSection(section);
              return {
                ...section,
                section_id: `${game.id}_${i}`,
                embedding,
              };
            })
          );

          await upsertGame({
            id: game.id,
            jeu: game.jeu,
            fichier: filePath,
            date_ajout: new Date().toISOString(),
            metadata: result.metadata,
            statistiques: result.statistiques,
            sections: sectionsWithEmbeddings,
          });

          successCount++;
        } catch (error) {
          errors.push(`${game.jeu}: ${error instanceof Error ? error.message : 'erreur inconnue'}`);
        }
      }

      if (errors.length > 0) {
        return {
          success: true,
          message: `${successCount}/${games.length} jeux recalculés. Erreurs: ${errors.join(', ')}`,
        };
      }

      return {
        success: true,
        message: `${successCount} jeu(x) recalculé(s) avec succès`,
      };
    } catch (error) {
      console.error('Erreur lors du recalcul global:', error);
      return fail(500, {
        error: 'Erreur lors du recalcul global',
      });
    }
  },
} satisfies Actions;
