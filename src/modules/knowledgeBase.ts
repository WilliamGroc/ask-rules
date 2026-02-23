/**
 * knowledgeBase.ts
 * CRUD asynchrone pour la base de connaissance PostgreSQL.
 *
 * Les sections sont stockées avec leurs embeddings dans la table `sections`.
 * La similarité vectorielle est calculée par pgvector (colonne vector(384)).
 */

import pool from './db';
import type { KnowledgeBaseEntry, StoredSection, GameMetadata, Statistics } from '../types';

// ── Utilitaires ───────────────────────────────────────────────────────────────

/** Transforme un nom de jeu en slug URL-safe. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Formate un vecteur dense pour l'insertion pgvector : "[n1,n2,...]" */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

// ── Opérations ────────────────────────────────────────────────────────────────

/**
 * Insère ou met à jour un jeu et toutes ses sections (upsert par id).
 * Les sections existantes sont supprimées puis réinsérées (ON DELETE CASCADE).
 */
export async function upsertGame(entry: KnowledgeBaseEntry): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert du jeu
    await client.query(
      `INSERT INTO games (id, jeu, fichier, date_ajout, metadata, statistiques)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         jeu          = EXCLUDED.jeu,
         fichier      = EXCLUDED.fichier,
         metadata     = EXCLUDED.metadata,
         statistiques = EXCLUDED.statistiques`,
      [
        entry.id,
        entry.jeu,
        entry.fichier,
        entry.date_ajout,
        JSON.stringify(entry.metadata),
        JSON.stringify(entry.statistiques),
      ],
    );

    // Supprime les sections existantes (ON DELETE CASCADE ne suffit pas ici
    // car on remplace les sections, pas le jeu entier)
    await client.query('DELETE FROM sections WHERE game_id = $1', [entry.id]);

    // Insère les nouvelles sections
    for (const section of entry.sections) {
      const embedding = section.embedding && section.embedding.length > 0
        ? toVectorLiteral(section.embedding as number[])
        : null;

      await client.query(
        `INSERT INTO sections
           (id, game_id, titre, niveau, type_section, contenu,
            entites, actions, resume, mecaniques, embedding,
            page_debut, page_fin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          section.section_id,
          entry.id,
          section.titre,
          section.niveau,
          section.type_section,
          section.contenu,
          section.entites,
          section.actions,
          section.resume,
          section.mecaniques,
          embedding,
          section.page_debut ?? null,
          section.page_fin ?? null,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Vérifie si un jeu existe dans la base par son id. */
export async function gameExists(id: string): Promise<boolean> {
  const res = await pool.query('SELECT 1 FROM games WHERE id = $1', [id]);
  return res.rowCount !== null && res.rowCount > 0;
}

/** Retourne le nombre de sections actuellement indexées pour un jeu. */
export async function countSections(gameId: string): Promise<number> {
  const res = await pool.query(
    'SELECT COUNT(*) AS nb FROM sections WHERE game_id = $1',
    [gameId],
  );
  return parseInt(res.rows[0].nb, 10);
}

/**
 * Ajoute des sections à un jeu existant sans supprimer les sections actuelles.
 * Les section_id dans entry.sections doivent déjà inclure l'offset
 * (calculé via countSections) pour éviter les collisions.
 * Met à jour games.fichier pour tracer les fichiers sources.
 */
export async function mergeGame(entry: KnowledgeBaseEntry): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ajoute le nouveau fichier à la liste des sources
    await client.query(
      `UPDATE games SET fichier = fichier || ' + ' || $1 WHERE id = $2`,
      [entry.fichier, entry.id],
    );

    // Insère les nouvelles sections (IDs déjà décalés par l'offset)
    for (const section of entry.sections) {
      const embedding = section.embedding && section.embedding.length > 0
        ? toVectorLiteral(section.embedding as number[])
        : null;

      await client.query(
        `INSERT INTO sections
           (id, game_id, titre, niveau, type_section, contenu,
            entites, actions, resume, mecaniques, embedding,
            page_debut, page_fin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          section.section_id,
          entry.id,
          section.titre,
          section.niveau,
          section.type_section,
          section.contenu,
          section.entites,
          section.actions,
          section.resume,
          section.mecaniques,
          embedding,
          section.page_debut ?? null,
          section.page_fin ?? null,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Trouve un jeu par son identifiant ou son chemin de fichier. */
export async function findGame(idOrPath: string): Promise<KnowledgeBaseEntry | null> {
  const res = await pool.query(
    'SELECT * FROM games WHERE id = $1 OR fichier = $2',
    [idOrPath, idOrPath],
  );
  if (res.rowCount === 0) return null;

  const row = res.rows[0];
  const sections = await loadSections(row.id);

  return {
    id: row.id,
    jeu: row.jeu,
    fichier: row.fichier,
    date_ajout: row.date_ajout,
    metadata: row.metadata as GameMetadata,
    statistiques: row.statistiques as Statistics,
    sections,
  };
}

/** Supprime un jeu et toutes ses sections (CASCADE). */
export async function removeGame(id: string): Promise<void> {
  await pool.query('DELETE FROM games WHERE id = $1', [id]);
}

/** Retourne la liste de tous les jeux (sans leurs sections). */
export async function listGames(): Promise<Array<{ id: string; jeu: string; fichier: string }>> {
  const res = await pool.query('SELECT id, jeu, fichier FROM games ORDER BY jeu');
  return res.rows;
}

/** Résumé textuel de l'état de la base. */
export async function summarizeKB(): Promise<string> {
  const games = await pool.query('SELECT COUNT(*) AS nb FROM games');
  const sections = await pool.query('SELECT COUNT(*) AS nb FROM sections');
  return `${games.rows[0].nb} jeu(x), ${sections.rows[0].nb} section(s) indexée(s)`;
}

// ── Chargement des sections ───────────────────────────────────────────────────

async function loadSections(gameId: string): Promise<StoredSection[]> {
  const res = await pool.query(
    'SELECT * FROM sections WHERE game_id = $1 ORDER BY id',
    [gameId],
  );
  return res.rows.map(rowToStoredSection);
}

function rowToStoredSection(row: Record<string, any>): StoredSection {
  return {
    section_id: row.id,
    titre: row.titre,
    contenu: row.contenu,
    niveau: row.niveau as 1 | 2 | 3,
    type_section: row.type_section,
    entites: row.entites ?? [],
    actions: row.actions ?? [],
    resume: row.resume ?? '',
    mecaniques: row.mecaniques ?? [],
    embedding: row.embedding ?? null,
    page_debut: row.page_debut ?? undefined,
    page_fin: row.page_fin ?? undefined,
  };
}
