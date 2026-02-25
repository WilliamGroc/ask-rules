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

      const fs = await import('node:fs');
      const path = await import('node:path');

      // Découpe les chemins de fichiers (séparés par " + " si plusieurs)
      const filePaths = filePath.split(' + ').map((p) => p.trim());

      // Vérifie que tous les fichiers existent
      for (const fp of filePaths) {
        const absolutePath = path.resolve(process.cwd(), fp);
        if (!fs.existsSync(absolutePath)) {
          return fail(404, {
            error: `Fichier source introuvable : ${fp}`,
          });
        }
      }

      // Réexécute le pipeline pour chaque fichier
      const { analyseFile } = await import('../../../pipeline');
      const { upsertGame } = await import('../../../modules/knowledgeBase');
      const { generateEmbeddingForSection } = await import('../../../modules/embedder');

      const allSections: any[] = [];
      let mergedMetadata = {};
      let mergedStatistics = {};

      for (const fp of filePaths) {
        const absolutePath = path.resolve(process.cwd(), fp);

        const result = await analyseFile(absolutePath, {
          withEmbed: false,
          withChunking: true,
        });

        allSections.push(...result.sections);

        // Fusionne les métadonnées (prend les valeurs du dernier fichier)
        mergedMetadata = { ...mergedMetadata, ...result.metadata };
        mergedStatistics = { ...mergedStatistics, ...result.statistiques };
      }

      // Génère les embeddings pour toutes les sections
      const sectionsWithEmbeddings = await Promise.all(
        allSections.map(async (section, i) => {
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
        fichier: filePath, // Conserve la chaîne originale avec " + "
        date_ajout: new Date().toISOString(),
        metadata: mergedMetadata,
        statistiques: mergedStatistics,
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

          // Découpe les chemins de fichiers (séparés par " + " si plusieurs)
          const filePaths = filePath.split(' + ').map((p: string) => p.trim());

          // Vérifie que tous les fichiers existent
          let allFilesExist = true;
          for (const fp of filePaths) {
            const absolutePath = path.resolve(process.cwd(), fp);
            if (!fs.existsSync(absolutePath)) {
              errors.push(`${game.jeu}: fichier introuvable (${fp})`);
              allFilesExist = false;
              break;
            }
          }

          if (!allFilesExist) {
            continue;
          }

          // Réexécute le pipeline pour chaque fichier
          const { analyseFile } = await import('../../../pipeline');
          const { upsertGame } = await import('../../../modules/knowledgeBase');
          const { generateEmbeddingForSection } = await import('../../../modules/embedder');

          const allSections: any[] = [];
          let mergedMetadata = {};
          let mergedStatistics = {};

          for (const fp of filePaths) {
            const absolutePath = path.resolve(process.cwd(), fp);

            const result = await analyseFile(absolutePath, {
              withEmbed: false,
              withChunking: true,
            });

            allSections.push(...result.sections);
            mergedMetadata = { ...mergedMetadata, ...result.metadata };
            mergedStatistics = { ...mergedStatistics, ...result.statistiques };
          }

          const sectionsWithEmbeddings = await Promise.all(
            allSections.map(async (section, i) => {
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
            metadata: mergedMetadata,
            statistiques: mergedStatistics,
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
