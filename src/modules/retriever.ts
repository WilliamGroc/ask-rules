/**
 * retriever.ts
 * Recherche sémantique dans PostgreSQL via pgvector (cosinus) ou hybrid search.
 *
 * Deux modes disponibles :
 *   1. Dense (défaut) : Embeddings uniquement via pgvector
 *   2. Hybrid : Combine embeddings (dense) + full-text BM25 (sparse)
 *
 * Pipeline Dense :
 *   1. Génère un embedding dense 384 dims de la question (Transformers.js)
 *   2. Requête pgvector avec l'opérateur <=> (distance cosinus)
 *   3. Sélection du jeu le plus pertinent
 *   4. Retour des N sections les plus proches du jeu sélectionné
 *
 * Pipeline Hybrid :
 *   1. Recherche dense (top 20) via embeddings
 *   2. Recherche sparse (top 20) via PostgreSQL full-text
 *   3. Fusion RRF (Reciprocal Rank Fusion)
 *   4. Retour des N meilleurs résultats fusionnés
 */

import pool from './db';
import { generateEmbedding } from './embedder';
import { hybridSearch, hybridSearchForGame, hybridSearchBestGame } from './hybridSearch';
import type { ScoredSection, StoredSection } from '../types';

/** Résultat de la sélection d'un jeu pour une requête donnée. */
export interface GameSelection {
  jeu: string;
  jeu_id: string;
  /** Score agrégé (somme des top-3 sections) */
  relevanceScore: number;
  /** True si le nom du jeu a été détecté dans la question */
  matchedName: boolean;
  sections: ScoredSection[];
}

/** Options de recherche */
export interface RetrievalOptions {
  /** Utilise l'hybrid search (dense + sparse) au lieu de dense seul */
  useHybrid?: boolean;
  /** Nombre de sections à retourner */
  topN?: number;
  /** Seuil minimal de similarité (dense uniquement) */
  minScore?: number;
  /** Active les logs de debug */
  debug?: boolean;
}

// ── Utilitaire ────────────────────────────────────────────────────────────────

/** Vérifie si le nom d'un jeu est mentionné dans la question. */
function gameNameInQuery(gameName: string, query: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const queryNorm = normalize(query);
  const nameWords = normalize(gameName).split(/\s+/).filter(w => w.length >= 5);
  return nameWords.some(w => queryNorm.includes(w));
}

/** Formate un vecteur dense pour pgvector : "[n1,n2,...]" */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

/** Convertit une ligne PostgreSQL en ScoredSection. */
function rowToScoredSection(row: Record<string, any>): ScoredSection {
  const section: StoredSection = {
    section_id: row.id,
    titre: row.titre,
    contenu: row.contenu,
    niveau: row.niveau as 1 | 2 | 3,
    type_section: row.type_section,
    entites: row.entites ?? [],
    actions: row.actions ?? [],
    resume: row.resume ?? '',
    mecaniques: row.mecaniques ?? [],
    embedding: null, // non rechargé pour économiser la mémoire
    page_debut: row.page_debut ?? undefined,
    page_fin: row.page_fin ?? undefined,
  };
  return {
    score: parseFloat(row.score),
    section,
    jeu: row.jeu,
    jeu_id: row.game_id,
  };
}

// ── Recherche ─────────────────────────────────────────────────────────────────

/**
 * Sélectionne le jeu le plus pertinent et retourne ses meilleures sections.
 *
 * Stratégie de sélection (ordre de priorité) :
 *   1. Seul jeu en base → le choisir directement.
 *   2. Nom d'un jeu présent littéralement dans la question → ce jeu.
 *   3. Sinon → jeu avec le score agrégé le plus élevé.
 *
 * @param query    - Question ou mots-clés
 * @param topN     - Nombre de sections renvoyées (défaut : 4)
 * @param minScore - Seuil minimal de similarité cosinus (défaut : 0.1)
 * @param options  - Options avancées (hybrid search, debug...)
 */
export async function retrieveFromBestGame(
  query: string,
  topN = 4,
  minScore = 0.1,
  options: Omit<RetrievalOptions, 'topN' | 'minScore'> = {},
): Promise<GameSelection | null> {
  // Si hybrid search activé, utilise la nouvelle implémentation
  if (options.useHybrid) {
    return hybridSearchBestGame(query, topN);
  }

  // Sinon, utilise l'ancienne implémentation (dense uniquement)
  return _retrieveFromBestGameDense(query, topN, minScore);
}

/**
 * Recherche des sections pour une question dans un jeu spécifique.
 * Le jeu est identifié par correspondance partielle sur le nom (insensible à la casse).
 * 
 * @param query - Question utilisateur
 * @param gameName - Nom partiel ou complet du jeu
 * @param topN - Nombre de sections à retourner
 * @param options - Options avancées
 */
export async function retrieveForGame(
  query: string,
  gameName: string,
  topN = 4,
  options: Omit<RetrievalOptions, 'topN'> = {},
): Promise<GameSelection | null> {
  // Résout le gameId depuis le nom
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const needle = normalize(gameName);

  const res = await pool.query<{ id: string; jeu: string }>(
    'SELECT id, jeu FROM games',
  );
  const match = res.rows.find(g => normalize(g.jeu).includes(needle));
  if (!match) return null;

  // Si hybrid search activé
  if (options.useHybrid) {
    const results = await hybridSearchForGame(query, match.id, topN);
    if (results.length === 0) return null;

    return {
      jeu: match.jeu,
      jeu_id: match.id,
      relevanceScore: results.slice(0, 3).reduce((s, r) => s + r.score, 0),
      matchedName: false,
      sections: results,
    };
  }

  // Sinon, mode dense
  const queryEmbedding = await generateEmbedding(query);
  const vectorLiteral = toVectorLiteral(queryEmbedding);
  return searchWithinGame(match.id, match.jeu, vectorLiteral, topN, 0.01, false);
}

// ── Implémentation Dense (Legacy) ─────────────────────────────────────────────

/**
 * Implémentation originale de la recherche dense uniquement.
 * Conservée pour backward compatibility et comparaison.
 */
async function _retrieveFromBestGameDense(
  query: string,
  topN = 4,
  minScore = 0.1,
): Promise<GameSelection | null> {
  // Vérifie qu'il y a des jeux en base
  const gamesRes = await pool.query<{ id: string; jeu: string }>(
    'SELECT id, jeu FROM games ORDER BY jeu',
  );
  if (gamesRes.rowCount === 0) return null;

  const games = gamesRes.rows;

  // Embed la question
  const queryEmbedding = await generateEmbedding(query);
  const vectorLiteral = toVectorLiteral(queryEmbedding);

  // Détermine le filtre par jeu selon la stratégie de sélection
  let targetGameId: string | null = null;
  let matchedName = false;

  if (games.length === 1) {
    // Priorité 1 : seul jeu
    targetGameId = games[0].id;
  } else {
    // Priorité 2 : nom du jeu dans la question
    const named = games.find(g => gameNameInQuery(g.jeu, query));
    if (named) {
      targetGameId = named.id;
      matchedName = true;
    }
  }

  if (targetGameId) {
    // Recherche directement dans le jeu ciblé
    return searchWithinGame(
      targetGameId,
      games.find(g => g.id === targetGameId)!.jeu,
      vectorLiteral,
      topN,
      minScore,
      matchedName,
    );
  }

  // Priorité 3 : sélectionner le meilleur jeu par score agrégé
  return selectBestGameByScore(games, vectorLiteral, topN, minScore);
}

// ── Helpers SQL ───────────────────────────────────────────────────────────────

/** Récupère les topN sections les plus proches d'un jeu donné. */
async function searchWithinGame(
  gameId: string,
  jeu: string,
  vectorLiteral: string,
  topN: number,
  minScore: number,
  matchedName: boolean,
): Promise<GameSelection | null> {
  const res = await pool.query(
    `SELECT s.id, s.game_id, g.jeu, s.titre, s.contenu, s.niveau,
            s.type_section, s.entites, s.actions, s.resume, s.mecaniques,
            s.page_debut, s.page_fin,
            1 - (s.embedding <=> $1::vector) AS score
     FROM sections s
     JOIN games g ON g.id = s.game_id
     WHERE s.game_id = $2
       AND s.embedding IS NOT NULL
       AND 1 - (s.embedding <=> $1::vector) >= $3
     ORDER BY s.embedding <=> $1::vector
     LIMIT $4`,
    [vectorLiteral, gameId, minScore, topN],
  );

  if (res.rowCount === 0) return null;

  const sections = res.rows.map(rowToScoredSection);
  const relevanceScore = sections.slice(0, 3).reduce((s, r) => s + r.score, 0);

  return { jeu, jeu_id: gameId, relevanceScore, matchedName, sections };
}

/**
 * Récupère des candidats sur tous les jeux, groupe par jeu,
 * sélectionne celui avec le score agrégé le plus élevé et retourne ses topN sections.
 */
async function selectBestGameByScore(
  games: Array<{ id: string; jeu: string }>,
  vectorLiteral: string,
  topN: number,
  minScore: number,
): Promise<GameSelection | null> {
  // On récupère topN * 3 candidats pour avoir assez de données par jeu
  const limit = topN * games.length * 3;

  const res = await pool.query(
    `SELECT s.id, s.game_id, g.jeu, s.titre, s.contenu, s.niveau,
            s.type_section, s.entites, s.actions, s.resume, s.mecaniques,
            s.page_debut, s.page_fin,
            1 - (s.embedding <=> $1::vector) AS score
     FROM sections s
     JOIN games g ON g.id = s.game_id
     WHERE s.embedding IS NOT NULL
       AND 1 - (s.embedding <=> $1::vector) >= $2
     ORDER BY s.embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral, minScore, limit],
  );

  if (res.rowCount === 0) return null;

  const rows = res.rows.map(rowToScoredSection);

  // Groupe les sections par jeu
  const byGame = new Map<string, ScoredSection[]>();
  for (const row of rows) {
    if (!byGame.has(row.jeu_id)) byGame.set(row.jeu_id, []);
    byGame.get(row.jeu_id)!.push(row);
  }

  // Sélectionne le jeu avec le score agrégé le plus élevé (top-3 sections)
  let bestGameId = '';
  let bestScore = -1;

  for (const [gameId, sections] of byGame) {
    const aggregate = sections.slice(0, 3).reduce((s, r) => s + r.score, 0);
    if (aggregate > bestScore) {
      bestScore = aggregate;
      bestGameId = gameId;
    }
  }

  const bestSections = byGame.get(bestGameId)!;
  const bestGame = games.find(g => g.id === bestGameId)!;

  return {
    jeu: bestGame.jeu,
    jeu_id: bestGameId,
    relevanceScore: bestScore,
    matchedName: false,
    sections: bestSections.slice(0, topN),
  };
}
