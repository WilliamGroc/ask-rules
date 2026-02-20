/**
 * knowledgeBase.ts
 * CRUD pour la base de connaissance persistée en JSON.
 *
 * La KB stocke les jeux analysés avec leurs sections, métadonnées
 * et vecteurs TF-IDF. Le fichier par défaut est data/knowledge-base.json.
 */

import fs from 'fs';
import path from 'path';
import type { KnowledgeBase, KnowledgeBaseEntry } from '../types';

export const KB_DEFAULT_PATH = path.resolve(process.cwd(), 'data/knowledge-base.json');

const EMPTY_KB: KnowledgeBase = {
  version: '1.0',
  updated_at: new Date().toISOString(),
  games: [],
};

// ── I/O ───────────────────────────────────────────────────────────────────────

/** Charge la KB depuis le disque, retourne une KB vide si le fichier n'existe pas. */
export function loadKB(kbPath = KB_DEFAULT_PATH): KnowledgeBase {
  if (!fs.existsSync(kbPath)) return { ...EMPTY_KB, games: [] };
  try {
    return JSON.parse(fs.readFileSync(kbPath, 'utf-8')) as KnowledgeBase;
  } catch {
    return { ...EMPTY_KB, games: [] };
  }
}

/** Persiste la KB sur le disque. */
export function saveKB(kb: KnowledgeBase, kbPath = KB_DEFAULT_PATH): void {
  fs.mkdirSync(path.dirname(kbPath), { recursive: true });
  const updated: KnowledgeBase = { ...kb, updated_at: new Date().toISOString() };
  fs.writeFileSync(kbPath, JSON.stringify(updated, null, 2), 'utf-8');
}

// ── Opérations ────────────────────────────────────────────────────────────────

/**
 * Insère ou met à jour une entrée (upsert par id).
 * Retourne la KB mise à jour (mutation + retour pour chainage).
 */
export function upsertEntry(kb: KnowledgeBase, entry: KnowledgeBaseEntry): KnowledgeBase {
  const idx = kb.games.findIndex(g => g.id === entry.id);
  if (idx >= 0) {
    kb.games[idx] = entry;
  } else {
    kb.games.push(entry);
  }
  return kb;
}

/** Trouve une entrée par son identifiant ou son chemin de fichier. */
export function findEntry(kb: KnowledgeBase, idOrPath: string): KnowledgeBaseEntry | undefined {
  return kb.games.find(g => g.id === idOrPath || g.fichier === idOrPath);
}

/** Supprime une entrée par son identifiant. */
export function removeEntry(kb: KnowledgeBase, id: string): KnowledgeBase {
  kb.games = kb.games.filter(g => g.id !== id);
  return kb;
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

/** Transforme un nom de jeu en slug URL-safe. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // retire les accents
    .replace(/[^a-z0-9]+/g, '-')      // remplace tout non-alphanum par tiret
    .replace(/^-|-$/g, '');           // supprime les tirets en début/fin
}

/** Résumé textuel de l'état de la KB. */
export function summarizeKB(kb: KnowledgeBase): string {
  const totalSections = kb.games.reduce((sum, g) => sum + g.sections.length, 0);
  return `${kb.games.length} jeu(x), ${totalSections} section(s) indexée(s)`;
}
