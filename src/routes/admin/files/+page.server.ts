import type { PageServerLoad, Actions } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from '@sveltejs/kit';

const UPLOADS_DIR = path.resolve(process.env['UPLOADS_DIR'] ?? path.join(process.cwd(), 'uploads'));

interface FileInfo {
  name: string;
  path: string;
  relativePath: string;
  size: number;
  modified: Date;
  game: string;
}

function getAllFiles(dir: string, baseDir: string = dir): FileInfo[] {
  const files: FileInfo[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      const stats = fs.statSync(fullPath);
      const relativePath = path.relative(baseDir, fullPath);
      const game = relativePath.split(path.sep)[0];

      files.push({
        name: entry.name,
        path: fullPath,
        relativePath,
        size: stats.size,
        modified: stats.mtime,
        game,
      });
    }
  }

  return files;
}

export const load: PageServerLoad = async () => {
  const allFiles = getAllFiles(UPLOADS_DIR);

  // Trier par date de modification (plus récent en premier)
  allFiles.sort((a, b) => b.modified.getTime() - a.modified.getTime());

  // Calculer les statistiques
  const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);
  const gamesCount = new Set(allFiles.map((f) => f.game)).size;

  return {
    files: allFiles.map((f) => ({
      ...f,
      modified: f.modified.toISOString(),
    })),
    stats: {
      totalFiles: allFiles.length,
      totalSize,
      gamesCount,
    },
  };
};

export const actions = {
  delete: async ({ request }) => {
    const formData = await request.formData();
    const filePath = formData.get('filePath') as string;

    if (!filePath) {
      return fail(400, { error: 'Chemin du fichier manquant' });
    }

    // Vérifier que le fichier est dans le dossier uploads (sécurité)
    const absolutePath = path.resolve(filePath);
    if (!absolutePath.startsWith(UPLOADS_DIR)) {
      return fail(403, { error: 'Accès refusé' });
    }

    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);

        // Supprimer le dossier du jeu s'il est vide
        const gameDir = path.dirname(absolutePath);
        const remainingFiles = fs.readdirSync(gameDir);
        if (remainingFiles.length === 0) {
          fs.rmdirSync(gameDir);
        }

        return { success: true, message: 'Fichier supprimé avec succès' };
      } else {
        return fail(404, { error: 'Fichier introuvable' });
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      return fail(500, { error: 'Erreur lors de la suppression du fichier' });
    }
  },
} satisfies Actions;
