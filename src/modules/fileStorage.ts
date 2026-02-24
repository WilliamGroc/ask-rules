/**
 * fileStorage.ts — Gestion du stockage permanent des fichiers uploadés.
 *
 * Structure des fichiers :
 *   uploads/{game-slug}/{timestamp}_{original-filename}
 *
 * Exemple :
 *   uploads/7-wonders/1709123456789_regles.pdf
 *   uploads/catan/1709123789012_rules-fr.pdf
 */

import fs from 'fs';
import path from 'path';
import { slugify } from './knowledgeBase';

/** Répertoire racine pour tous les uploads */
const UPLOADS_DIR = path.resolve(
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads')
);

/**
 * Initialise le répertoire uploads s'il n'existe pas.
 */
export function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Retourne le répertoire de stockage pour un jeu donné.
 * Crée le répertoire s'il n'existe pas.
 */
export function getGameUploadDir(gameSlug: string): string {
  const gameDir = path.join(UPLOADS_DIR, gameSlug);
  if (!fs.existsSync(gameDir)) {
    fs.mkdirSync(gameDir, { recursive: true });
  }
  return gameDir;
}

/**
 * Sauvegarde un fichier dans le répertoire du jeu.
 * 
 * @param gameSlug - Slug du jeu (ex: "7-wonders")
 * @param originalFilename - Nom du fichier original (ex: "regles.pdf")
 * @param content - Contenu du fichier (Buffer ou Uint8Array)
 * @returns Chemin relatif du fichier sauvegardé (ex: "uploads/7-wonders/1709123456789_regles.pdf")
 */
export function saveUploadedFile(
  gameSlug: string,
  originalFilename: string,
  content: Buffer | Uint8Array,
): string {
  ensureUploadsDir();
  const gameDir = getGameUploadDir(gameSlug);

  // Nettoie le nom de fichier original (supprime caractères spéciaux)
  const cleanFilename = originalFilename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');

  // Ajoute un timestamp pour éviter les collisions
  const timestamp = Date.now();
  const filename = `${timestamp}_${cleanFilename}`;

  const absolutePath = path.join(gameDir, filename);
  fs.writeFileSync(absolutePath, content as any);

  // Retourne le chemin relatif depuis la racine du projet
  return path.relative(process.cwd(), absolutePath);
}

/**
 * Copie un fichier temporaire vers le stockage permanent.
 * 
 * @param tmpPath - Chemin du fichier temporaire
 * @param gameSlug - Slug du jeu
 * @param originalFilename - Nom du fichier original
 * @returns Chemin relatif du fichier sauvegardé
 */
export function moveToStorage(
  tmpPath: string,
  gameSlug: string,
  originalFilename: string,
): string {
  const content = fs.readFileSync(tmpPath);
  return saveUploadedFile(gameSlug, originalFilename, content);
}

/**
 * Retourne le chemin absolu d'un fichier stocké.
 * 
 * @param relativePath - Chemin relatif (ex: "uploads/7-wonders/1709123456789_regles.pdf")
 * @returns Chemin absolu
 */
export function getAbsolutePath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

/**
 * Vérifie si un fichier stocké existe.
 */
export function fileExists(relativePath: string): boolean {
  return fs.existsSync(getAbsolutePath(relativePath));
}

/**
 * Supprime un fichier stocké.
 */
export function deleteFile(relativePath: string): void {
  const absolutePath = getAbsolutePath(relativePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

/**
 * Liste tous les fichiers d'un jeu.
 */
export function listGameFiles(gameSlug: string): string[] {
  const gameDir = path.join(UPLOADS_DIR, gameSlug);
  if (!fs.existsSync(gameDir)) return [];

  return fs.readdirSync(gameDir)
    .filter(f => !f.startsWith('.'))
    .map(f => path.join('uploads', gameSlug, f));
}

/**
 * Supprime tous les fichiers d'un jeu (appelé lors de la suppression d'un jeu).
 */
export function deleteGameFiles(gameSlug: string): void {
  const gameDir = path.join(UPLOADS_DIR, gameSlug);
  if (fs.existsSync(gameDir)) {
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
}

/**
 * Retourne la taille totale des fichiers uploadés (en octets).
 */
export function getTotalStorageSize(): number {
  if (!fs.existsSync(UPLOADS_DIR)) return 0;

  let total = 0;
  const walk = (dir: string) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filepath = path.join(dir, file);
      const stat = fs.statSync(filepath);
      if (stat.isDirectory()) {
        walk(filepath);
      } else {
        total += stat.size;
      }
    }
  };

  walk(UPLOADS_DIR);
  return total;
}

/**
 * Formate une taille en octets en format lisible.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
