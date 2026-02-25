/**
 * files/[...path]/+server.ts — Endpoint pour servir les fichiers uploadés
 *
 * Permet aux utilisateurs de télécharger les fichiers sources des jeux.
 *
 * Exemple : GET /files/uploads/7-wonders/1709123456789_regles.pdf
 */

import { error } from '@sveltejs/kit';
import { fileExists, getAbsolutePath } from '../../../modules/fileStorage';
import fs from 'node:fs';
import path from 'node:path';

export const GET = async ({ params }: { params: { path: string } }) => {
  const filePath = params.path;

  if (!filePath) {
    throw error(400, 'Chemin de fichier requis');
  }

  // Vérifie que le fichier existe
  if (!fileExists(filePath)) {
    throw error(404, 'Fichier non trouvé');
  }

  const absolutePath = getAbsolutePath(filePath);

  // Sécurité : vérifie que le fichier est bien dans uploads/
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!absolutePath.startsWith(uploadsDir)) {
    throw error(403, 'Accès refusé');
  }

  // Lit le fichier
  const fileContent = fs.readFileSync(absolutePath);

  // Détermine le type MIME
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  // Nom de fichier pour le téléchargement
  const filename = path.basename(filePath);

  return new Response(fileContent as any, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': fileContent.length.toString(),
      'Cache-Control': 'public, max-age=31536000', // Cache 1 an
    },
  });
};
