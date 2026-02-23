/**
 * migrate.ts — Initialise le schéma PostgreSQL pour ask-rules
 *
 * Usage :
 *   ts-node src/migrate.ts
 *
 * Crée :
 *   - Extension pgvector
 *   - Table `games`    : métadonnées des jeux indexés
 *   - Table `sections` : sections de règles avec embeddings vectoriels (384 dims)
 *   - Index HNSW       : recherche approximative rapide par cosinus
 */

import 'dotenv/config';
import pool from './modules/db';

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Extension pgvector ────────────────────────────────────────────────────
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('✔ Extension vector activée');

    // ── Table games ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id           TEXT        PRIMARY KEY,
        jeu          TEXT        NOT NULL,
        fichier      TEXT        NOT NULL,
        date_ajout   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata     JSONB       NOT NULL DEFAULT '{}',
        statistiques JSONB       NOT NULL DEFAULT '{}'
      )
    `);
    console.log('✔ Table "games" prête');

    // ── Table sections ────────────────────────────────────────────────────────
    // embedding : vecteur dense 384 dims (Xenova/paraphrase-multilingual-MiniLM-L12-v2)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id           TEXT        PRIMARY KEY,
        game_id      TEXT        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        titre        TEXT        NOT NULL,
        niveau       INTEGER     NOT NULL,
        type_section TEXT        NOT NULL,
        contenu      TEXT        NOT NULL,
        entites      TEXT[]      NOT NULL DEFAULT '{}',
        actions      TEXT[]      NOT NULL DEFAULT '{}',
        resume       TEXT        NOT NULL DEFAULT '',
        mecaniques   TEXT[]      NOT NULL DEFAULT '{}',
        embedding    vector(384),
        page_debut   INTEGER,
        page_fin     INTEGER
      )
    `);
    console.log('✔ Table "sections" prête');

    // ── Colonnes page (ajout sur installation existante) ──────────────────────
    await client.query(`
      ALTER TABLE sections
        ADD COLUMN IF NOT EXISTS page_debut INTEGER,
        ADD COLUMN IF NOT EXISTS page_fin   INTEGER
    `);
    console.log('✔ Colonnes page_debut / page_fin présentes');

    // ── Index HNSW (cosinus) ──────────────────────────────────────────────────
    // HNSW ne nécessite pas de données existantes (contrairement à IVFFlat)
    await client.query(`
      CREATE INDEX IF NOT EXISTS sections_embedding_hnsw_idx
        ON sections USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);
    console.log('✔ Index HNSW créé sur sections.embedding');

    await client.query('COMMIT');
    console.log('\nMigration terminée avec succès.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('✖  Erreur migration :', err.message ?? err);
  process.exit(1);
});
