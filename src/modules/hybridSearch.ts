/**
 * hybridSearch.ts — Recherche hybride combinant dense et sparse
 *
 * Stratégie :
 *   1. Recherche dense (embeddings + pgvector) → score sémantique
 *   2. Recherche sparse (BM25 + PostgreSQL full-text) → score lexical
 *   3. Fusion des scores avec pondération configurable
 *
 * Avantages de l'hybrid search :
 *   - Capture les synonymes et concepts (embeddings)
 *   - Capture les termes exacts (noms de cartes, règles spécifiques)
 *   - Amélioration +15-20% de précision vs dense seul
 *
 * Algorithme de fusion :
 *   - Reciprocal Rank Fusion (RRF) ou weighted sum
 *   - Normalisation des scores entre 0-1
 */

import pool from './db';
import { generateEmbedding } from './embedder';
import type { ScoredSection, StoredSection } from '../types';

// ── Configuration ─────────────────────────────────────────────────────────────

/** Poids pour le score dense (embeddings) - entre 0 et 1 */
const DENSE_WEIGHT = 0.6;
/** Poids pour le score sparse (BM25) - entre 0 et 1 */
const SPARSE_WEIGHT = 0.4;
/** Nombre de résultats à récupérer pour chaque recherche avant fusion */
const TOP_K_PER_SEARCH = 20;
/** Constante k pour Reciprocal Rank Fusion */
const RRF_K = 60;

// ── Utilitaires ───────────────────────────────────────────────────────────────

/** Formate un vecteur dense pour pgvector : "[n1,n2,...]" */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

/** Convertit une ligne PostgreSQL en ScoredSection */
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
    embedding: null,
    page_debut: row.page_debut ?? undefined,
    page_fin: row.page_fin ?? undefined,
    hierarchy_path: row.hierarchy_path ?? undefined,
    chunk_index: row.chunk_index ?? undefined,
    total_chunks: row.total_chunks ?? undefined,
  };
  return {
    score: parseFloat(row.score ?? '0'),
    section,
    jeu: row.jeu,
    jeu_id: row.game_id,
  };
}

/**
 * Normalise un texte pour la recherche full-text française.
 * - Supprime la ponctuation
 * - Lowercase
 * - Gère les accents
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/[^\w\s]/g, ' ') // Remplace ponctuation par espace
    .split(/\s+/)
    .filter(w => w.length >= 2)
    .join(' & '); // Opérateur AND pour tsquery
}

// ── Recherche Dense (Embeddings) ──────────────────────────────────────────────

/**
 * Recherche sémantique via embeddings et pgvector.
 * 
 * @param query - Question utilisateur
 * @param gameId - ID du jeu (optionnel, null = tous les jeux)
 * @param topK - Nombre de résultats
 * @returns Sections scorées (score = similarité cosinus 0-1)
 */
async function searchDense(
  query: string,
  gameId: string | null,
  topK: number,
): Promise<ScoredSection[]> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorLiteral = toVectorLiteral(queryEmbedding);

  const gameFilter = gameId ? 'AND s.game_id = $2' : '';
  const params = gameId ? [vectorLiteral, gameId, topK] : [vectorLiteral, topK];
  const paramIndex = gameId ? 3 : 2;

  const sql = `
    SELECT
      s.id, s.game_id, s.titre, s.niveau, s.type_section, s.contenu,
      s.entites, s.actions, s.resume, s.mecaniques,
      s.page_debut, s.page_fin, s.hierarchy_path, s.chunk_index, s.total_chunks,
      g.jeu,
      1 - (s.embedding <=> $1::vector) AS score
    FROM sections s
    JOIN games g ON s.game_id = g.id
    WHERE s.embedding IS NOT NULL ${gameFilter}
    ORDER BY s.embedding <=> $1::vector
    LIMIT $${paramIndex}
  `;

  const res = await pool.query(sql, params);
  return res.rows.map(rowToScoredSection);
}

// ── Recherche Sparse (BM25 / Full-Text) ───────────────────────────────────────

/**
 * Recherche lexicale via PostgreSQL full-text search (BM25-like).
 * 
 * Le score ts_rank_cd est normalisé entre 0-1 approximativement.
 * Les poids sont définis dans le tsvector :
 *   - A (titre) : weight 1.0
 *   - B (hierarchy_path) : weight 0.4
 *   - C (contenu) : weight 0.2
 * 
 * @param query - Question utilisateur
 * @param gameId - ID du jeu (optionnel, null = tous les jeux)
 * @param topK - Nombre de résultats
 * @returns Sections scorées (score = ts_rank_cd normalisé)
 */
async function searchSparse(
  query: string,
  gameId: string | null,
  topK: number,
): Promise<ScoredSection[]> {
  const tsQuery = normalizeQuery(query);

  // Si la query est vide après normalisation, retourne vide
  if (!tsQuery.trim()) {
    return [];
  }

  const gameFilter = gameId ? 'AND s.game_id = $2' : '';
  const params = gameId ? [tsQuery, gameId, topK] : [tsQuery, topK];
  const paramIndex = gameId ? 3 : 2;

  // ts_rank_cd utilise les poids A, B, C définis dans search_vector
  // Normalisation 32 = divise par la longueur du document
  const sql = `
    SELECT
      s.id, s.game_id, s.titre, s.niveau, s.type_section, s.contenu,
      s.entites, s.actions, s.resume, s.mecaniques,
      s.page_debut, s.page_fin, s.hierarchy_path, s.chunk_index, s.total_chunks,
      g.jeu,
      ts_rank_cd(
        s.search_vector,
        to_tsquery('french', $1),
        32
      ) AS score
    FROM sections s
    JOIN games g ON s.game_id = g.id
    WHERE s.search_vector @@ to_tsquery('french', $1) ${gameFilter}
    ORDER BY score DESC
    LIMIT $${paramIndex}
  `;

  try {
    const res = await pool.query(sql, params);
    // Normalise les scores entre 0-1 (ts_rank_cd peut dépasser 1)
    const maxScore = Math.max(...res.rows.map(r => parseFloat(r.score ?? '0')), 0.001);
    return res.rows.map(row => {
      const section = rowToScoredSection(row);
      section.score = section.score / maxScore; // Normalisation
      return section;
    });
  } catch (err) {
    console.error('Erreur recherche sparse:', err);
    return [];
  }
}

// ── Fusion des Résultats ──────────────────────────────────────────────────────

/**
 * Fusionne les résultats dense et sparse avec Reciprocal Rank Fusion (RRF).
 * 
 * RRF est plus robuste que la simple moyenne de scores car :
 *   - Indépendant de l'échelle des scores
 *   - Privilégie les résultats bien classés dans les deux listes
 * 
 * Score RRF : sum(1 / (k + rank_i)) pour chaque liste
 * 
 * @param denseResults - Résultats de la recherche dense
 * @param sparseResults - Résultats de la recherche sparse
 * @param topN - Nombre de résultats finaux
 * @returns Sections fusionnées et classées
 */
function fuseResultsRRF(
  denseResults: ScoredSection[],
  sparseResults: ScoredSection[],
  topN: number,
): ScoredSection[] {
  // Map section_id -> score RRF
  const rrfScores = new Map<string, number>();
  // Map section_id -> ScoredSection (pour reconstituer)
  const sectionsMap = new Map<string, ScoredSection>();

  // Ajoute les scores RRF pour les résultats dense
  denseResults.forEach((result, rank) => {
    const id = result.section.section_id;
    const score = DENSE_WEIGHT / (RRF_K + rank + 1);
    rrfScores.set(id, (rrfScores.get(id) ?? 0) + score);
    sectionsMap.set(id, result);
  });

  // Ajoute les scores RRF pour les résultats sparse
  sparseResults.forEach((result, rank) => {
    const id = result.section.section_id;
    const score = SPARSE_WEIGHT / (RRF_K + rank + 1);
    rrfScores.set(id, (rrfScores.get(id) ?? 0) + score);
    if (!sectionsMap.has(id)) {
      sectionsMap.set(id, result);
    }
  });

  // Trie par score RRF décroissant
  const merged = Array.from(rrfScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, rrfScore]) => {
      const section = sectionsMap.get(id)!;
      return {
        ...section,
        score: rrfScore, // Score RRF final
      };
    });

  return merged;
}

/**
 * Fusionne les résultats dense et sparse avec une moyenne pondérée.
 * 
 * Méthode alternative à RRF :
 *   - Plus simple
 *   - Dépend de la normalisation des scores
 * 
 * Score final = DENSE_WEIGHT * score_dense + SPARSE_WEIGHT * score_sparse
 * 
 * @param denseResults - Résultats de la recherche dense
 * @param sparseResults - Résultats de la recherche sparse
 * @param topN - Nombre de résultats finaux
 * @returns Sections fusionnées et classées
 */
function fuseResultsWeighted(
  denseResults: ScoredSection[],
  sparseResults: ScoredSection[],
  topN: number,
): ScoredSection[] {
  // Map section_id -> scores [dense, sparse]
  const scoresMap = new Map<string, [number, number]>();
  const sectionsMap = new Map<string, ScoredSection>();

  denseResults.forEach(result => {
    const id = result.section.section_id;
    scoresMap.set(id, [result.score, 0]);
    sectionsMap.set(id, result);
  });

  sparseResults.forEach(result => {
    const id = result.section.section_id;
    const current = scoresMap.get(id) ?? [0, 0];
    scoresMap.set(id, [current[0], result.score]);
    if (!sectionsMap.has(id)) {
      sectionsMap.set(id, result);
    }
  });

  // Calcule le score pondéré
  const merged = Array.from(scoresMap.entries())
    .map(([id, [denseScore, sparseScore]]) => {
      const finalScore = DENSE_WEIGHT * denseScore + SPARSE_WEIGHT * sparseScore;
      const section = sectionsMap.get(id)!;
      return {
        ...section,
        score: finalScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return merged;
}

// ── API Principale ────────────────────────────────────────────────────────────

export interface HybridSearchOptions {
  /** ID du jeu à rechercher (null = tous les jeux) */
  gameId?: string | null;
  /** Nombre de résultats à retourner */
  topN?: number;
  /** Méthode de fusion : 'rrf' (recommandé) ou 'weighted' */
  fusionMethod?: 'rrf' | 'weighted';
  /** Active le mode debug (logs des scores intermédiaires) */
  debug?: boolean;
}

/**
 * Recherche hybride combinant embeddings (dense) et full-text (sparse).
 * 
 * Pipeline :
 *   1. Recherche dense (top 20) → scores sémantiques
 *   2. Recherche sparse (top 20) → scores lexicaux
 *   3. Fusion RRF ou weighted → top N résultats finaux
 * 
 * @param query - Question utilisateur
 * @param options - Options de recherche
 * @returns Sections scorées et fusionnées
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {},
): Promise<ScoredSection[]> {
  const {
    gameId = null,
    topN = 4,
    fusionMethod = 'rrf',
    debug = false,
  } = options;

  // 1. Recherche dense (embeddings)
  const denseResults = await searchDense(query, gameId, TOP_K_PER_SEARCH);

  // 2. Recherche sparse (full-text)
  const sparseResults = await searchSparse(query, gameId, TOP_K_PER_SEARCH);

  if (debug) {
    console.log('\n🔍 Hybrid Search Debug:');
    console.log(`  Dense results: ${denseResults.length}`);
    console.log(`  Sparse results: ${sparseResults.length}`);
    console.log(`  Top dense: ${denseResults.slice(0, 3).map(r => `${r.section.titre} (${r.score.toFixed(3)})`).join(', ')}`);
    console.log(`  Top sparse: ${sparseResults.slice(0, 3).map(r => `${r.section.titre} (${r.score.toFixed(3)})`).join(', ')}`);
  }

  // 3. Fusion
  const merged = fusionMethod === 'rrf'
    ? fuseResultsRRF(denseResults, sparseResults, topN)
    : fuseResultsWeighted(denseResults, sparseResults, topN);

  if (debug) {
    console.log(`  Final merged: ${merged.length}`);
    console.log(`  Top results: ${merged.slice(0, 3).map(r => `${r.section.titre} (${r.score.toFixed(3)})`).join(', ')}\n`);
  }

  return merged;
}

/**
 * Recherche hybride pour un jeu spécifique.
 * Wrapper de hybridSearch pour compatibilité avec l'API existante.
 */
export async function hybridSearchForGame(
  query: string,
  gameId: string,
  topN = 4,
): Promise<ScoredSection[]> {
  return hybridSearch(query, { gameId, topN });
}

/**
 * Sélectionne automatiquement le meilleur jeu puis effectue une recherche hybride.
 * Compatible avec l'API existante de retriever.ts.
 */
export async function hybridSearchBestGame(
  query: string,
  topN = 4,
): Promise<{
  jeu: string;
  jeu_id: string;
  relevanceScore: number;
  matchedName: boolean;
  sections: ScoredSection[];
} | null> {
  // Recherche dans tous les jeux
  const allResults = await hybridSearch(query, { topN: topN * 3 });

  if (allResults.length === 0) return null;

  // Agrège les scores par jeu
  const gameScores = new Map<string, { total: number; sections: ScoredSection[] }>();

  for (const result of allResults) {
    const gameId = result.jeu_id;
    const current = gameScores.get(gameId) ?? { total: 0, sections: [] };
    current.total += result.score;
    current.sections.push(result);
    gameScores.set(gameId, current);
  }

  // Sélectionne le jeu avec le meilleur score
  let bestGame: string | null = null;
  let bestScore = -1;

  for (const [gameId, data] of gameScores.entries()) {
    if (data.total > bestScore) {
      bestScore = data.total;
      bestGame = gameId;
    }
  }

  if (!bestGame) return null;

  const bestGameData = gameScores.get(bestGame)!;
  const topSections = bestGameData.sections
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return {
    jeu: topSections[0].jeu,
    jeu_id: bestGame,
    relevanceScore: bestScore,
    matchedName: false, // TODO: implémenter la détection du nom du jeu
    sections: topSections,
  };
}
