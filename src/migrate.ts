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
    // embedding : vecteur dense 384 dims (Xenova/multilingual-e5-small)
    // Colonnes de chunking hiérarchique (v2) :
    //   - hierarchy_path : chemin complet (ex: "MATÉRIEL > Cartes")
    //   - chunk_index    : index du chunk (0, 1, 2...)
    //   - total_chunks   : nombre total de chunks pour cette section
    // Colonne full-text search (v3) :
    //   - search_vector  : tsvector pour recherche lexicale BM25
    await client.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id             TEXT        PRIMARY KEY,
        game_id        TEXT        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        titre          TEXT        NOT NULL,
        niveau         INTEGER     NOT NULL,
        type_section   TEXT        NOT NULL,
        contenu        TEXT        NOT NULL,
        entites        TEXT[]      NOT NULL DEFAULT '{}',
        actions        TEXT[]      NOT NULL DEFAULT '{}',
        resume         TEXT        NOT NULL DEFAULT '',
        mecaniques     TEXT[]      NOT NULL DEFAULT '{}',
        embedding      vector(384),
        page_debut     INTEGER,
        page_fin       INTEGER,
        hierarchy_path TEXT        NOT NULL DEFAULT '',
        chunk_index    INTEGER     NOT NULL DEFAULT 0,
        total_chunks   INTEGER     NOT NULL DEFAULT 1,
        search_vector  tsvector
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

    // ── Colonnes chunking hiérarchique (v2) ────────────────────────────────────
    await client.query(`
      ALTER TABLE sections
        ADD COLUMN IF NOT EXISTS hierarchy_path TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS chunk_index    INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_chunks   INTEGER NOT NULL DEFAULT 1
    `);
    console.log('✔ Colonnes hierarchy_path / chunk_index / total_chunks présentes');

    // ── Colonne full-text search (v3) ──────────────────────────────────────────
    await client.query(`
      ALTER TABLE sections
        ADD COLUMN IF NOT EXISTS search_vector tsvector
    `);
    console.log('✔ Colonne search_vector présente');

    // Génère le tsvector pour les lignes existantes si la colonne vient d'être créée
    await client.query(`
      UPDATE sections 
      SET search_vector = 
        setweight(to_tsvector('french', coalesce(titre, '')), 'A') ||
        setweight(to_tsvector('french', coalesce(hierarchy_path, '')), 'B') ||
        setweight(to_tsvector('french', coalesce(contenu, '')), 'C')
      WHERE search_vector IS NULL
    `);
    console.log('✔ Vecteurs de recherche générés pour les sections existantes');

    // ── Index HNSW (cosinus) ──────────────────────────────────────────────────
    // HNSW ne nécessite pas de données existantes (contrairement à IVFFlat)
    await client.query(`
      CREATE INDEX IF NOT EXISTS sections_embedding_hnsw_idx
        ON sections USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);
    console.log('✔ Index HNSW créé sur sections.embedding');

    // ── Index GIN (full-text search) ──────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS sections_search_vector_idx
        ON sections USING gin (search_vector)
    `);
    console.log('✔ Index GIN créé sur sections.search_vector');

    // ── Trigger pour maintenir search_vector à jour ───────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION sections_search_vector_trigger() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('french', coalesce(NEW.titre, '')), 'A') ||
          setweight(to_tsvector('french', coalesce(NEW.hierarchy_path, '')), 'B') ||
          setweight(to_tsvector('french', coalesce(NEW.contenu, '')), 'C');
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS sections_search_vector_update ON sections;
      CREATE TRIGGER sections_search_vector_update
        BEFORE INSERT OR UPDATE OF titre, hierarchy_path, contenu
        ON sections
        FOR EACH ROW
        EXECUTE FUNCTION sections_search_vector_trigger();
    `);
    console.log('✔ Trigger automatique pour search_vector créé');

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

migrate().catch((err) => {
  console.error('✖  Erreur migration :', err.message ?? err);
  process.exit(1);
});
