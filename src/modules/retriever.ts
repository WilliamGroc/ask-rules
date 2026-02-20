/**
 * retriever.ts
 * Recherche sémantique dans la base de connaissance par similarité cosinus TF-IDF.
 *
 * Pipeline :
 *   1. Tokenisation française via AggressiveTokenizerFr (natural)
 *   2. Suppression des stopwords
 *   3. Stemming via PorterStemmerFr (natural) → "attaque"/"attaquer" → même stem
 *   4. Construction d'un vecteur TF normalisé (L2)
 *   5. Calcul de la similarité cosinus avec chaque section de la KB
 *   6. Retour des N sections les plus proches
 */

import { AggressiveTokenizerFr, PorterStemmerFr } from 'natural';
import type { KnowledgeBase, ScoredSection } from '../types';

const tokenizerFr = new AggressiveTokenizerFr();

// ── Stopwords français ────────────────────────────────────────────────────────

const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'et', 'ou',
  'mais', 'donc', 'or', 'ni', 'car', 'que', 'qui', 'qu', 'se', 'si', 'en',
  'y', 'il', 'elle', 'ils', 'elles', 'on', 'nous', 'vous', 'je', 'tu',
  'ce', 'cet', 'cette', 'ces', 'son', 'sa', 'ses', 'mon', 'ma', 'mes',
  'ton', 'ta', 'tes', 'leur', 'leurs', 'notre', 'votre', 'vos', 'nos',
  'a', 'au', 'aux', 'par', 'pour', 'sur', 'sous', 'dans', 'avec', 'sans',
  'est', 'sont', 'etre', 'avoir', 'fait', 'font', 'peut', 'peuvent',
  'tout', 'tous', 'toutes', 'toute', 'chaque', 'plus', 'moins', 'tres',
  'bien', 'aussi', 'alors', 'ainsi', 'dont', 'entre', 'vers', 'doit',
  'selon', 'afin', 'comme', 'encore', 'pas', 'non', 'oui',
]);

// ── Vectorisation ─────────────────────────────────────────────────────────────

/**
 * Tokenise et stemme un texte en français.
 * Utilise AggressiveTokenizerFr puis PorterStemmerFr pour normaliser les formes :
 * "attaque", "attaquer", "attaqué" → même stem → matchent entre eux.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = tokenizerFr.tokenize(text.toLowerCase()) ?? [];
  return tokens
    .filter(w => w.length > 2 && !STOPWORDS_FR.has(w))
    .map(w => PorterStemmerFr.stem(w));
}

/**
 * Construit un vecteur TF normalisé (L2) à partir d'un texte.
 * Retourne un objet sparse { stem: poids }.
 */
export function buildVector(text: string): Record<string, number> {
  const tokens = tokenize(text);
  const freq: Record<string, number> = {};
  tokens.forEach(t => { freq[t] = (freq[t] ?? 0) + 1; });

  const norm = Math.sqrt(Object.values(freq).reduce((s, v) => s + v * v, 0));
  const vector: Record<string, number> = {};
  Object.entries(freq).forEach(([term, count]) => {
    vector[term] = norm > 0 ? count / norm : 0;
  });
  return vector;
}

/**
 * Calcule la similarité cosinus entre deux vecteurs sparses.
 * Retourne un score entre 0 (aucun lien) et 1 (identiques).
 */
export function cosineSimilarity(
  v1: Record<string, number>,
  v2: Record<string, number>,
): number {
  let dot = 0, norm1 = 0, norm2 = 0;

  for (const [k, a] of Object.entries(v1)) {
    dot += a * (v2[k] ?? 0);
    norm1 += a * a;
  }
  for (const v of Object.values(v2)) {
    norm2 += v * v;
  }

  const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denom > 0 ? dot / denom : 0;
}

// ── Sélection du meilleur jeu ─────────────────────────────────────────────────

/** Résultat de la sélection d'un jeu pour une requête donnée. */
export interface GameSelection {
  /** Jeu sélectionné */
  jeu: string;
  jeu_id: string;
  /** Score agrégé (somme des top-3 sections) */
  relevanceScore: number;
  /** True si le nom du jeu a été détecté dans la question */
  matchedName: boolean;
  /** Sections les plus pertinentes du jeu sélectionné */
  sections: ScoredSection[];
}

/**
 * Vérifie si le nom d'un jeu est mentionné dans une question.
 * Comparaison insensible à la casse et aux accents sur les mots ≥ 4 caractères.
 */
function gameNameInQuery(gameName: string, query: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const queryNorm  = normalize(query);
  const nameWords  = normalize(gameName).split(/\s+/).filter(w => w.length >= 5);
  return nameWords.some(w => queryNorm.includes(w));
}

/**
 * Sélectionne le jeu le plus pertinent puis retourne ses meilleures sections.
 *
 * Stratégie de sélection (ordre de priorité) :
 *   1. Si KB contient un seul jeu → le choisir directement.
 *   2. Si le nom d'un jeu apparaît littéralement dans la question → ce jeu.
 *   3. Sinon → jeu avec le score TF-IDF agrégé le plus élevé (somme des 3 meilleures sections).
 *
 * @param query  - Question ou mots-clés
 * @param kb     - Base de connaissance
 * @param topN   - Nombre de sections renvoyées
 * @param minScore - Seuil minimal de similarité
 */
export function retrieveFromBestGame(
  query: string,
  kb: KnowledgeBase,
  topN = 4,
  minScore = 0.05,
): GameSelection | null {
  if (kb.games.length === 0) return null;

  const queryVector = buildVector(query);

  // Calcule les sections et le score agrégé pour chaque jeu
  const perGame = kb.games.map(game => {
    const matchedName = gameNameInQuery(game.jeu, query);

    const scored: ScoredSection[] = game.sections
      .map(section => ({
        score: cosineSimilarity(queryVector, section.tfidf_vector),
        section,
        jeu: game.jeu,
        jeu_id: game.id,
      }))
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score);

    // Score agrégé = somme des 3 meilleures sections
    const aggregateScore = scored.slice(0, 3).reduce((s, r) => s + r.score, 0);

    return { game, matchedName, scored, aggregateScore };
  });

  // Priorité 1 : mention explicite du nom du jeu dans la question
  const namedMatches = perGame.filter(g => g.matchedName);
  if (namedMatches.length === 1) {
    const g = namedMatches[0];
    return {
      jeu: g.game.jeu,
      jeu_id: g.game.id,
      relevanceScore: g.aggregateScore,
      matchedName: true,
      sections: g.scored.slice(0, topN),
    };
  }

  // Priorité 2 : score TF-IDF agrégé le plus élevé
  const best = perGame.reduce((a, b) => b.aggregateScore > a.aggregateScore ? b : a);

  if (best.scored.length === 0) return null;

  return {
    jeu: best.game.jeu,
    jeu_id: best.game.id,
    relevanceScore: best.aggregateScore,
    matchedName: best.matchedName,
    sections: best.scored.slice(0, topN),
  };
}

// ── Recherche dans la KB ──────────────────────────────────────────────────────

/**
 * Trouve les sections les plus pertinentes pour une requête textuelle.
 *
 * @param query    - Question ou mots-clés en français
 * @param kb       - Base de connaissance à interroger
 * @param topN     - Nombre de résultats à retourner (défaut : 4)
 * @param minScore - Score minimum pour être inclus (défaut : 0.05)
 */
export function retrieveRelevantSections(
  query: string,
  kb: KnowledgeBase,
  topN = 4,
  minScore = 0.05,
): ScoredSection[] {
  const queryVector = buildVector(query);
  const results: ScoredSection[] = [];

  for (const game of kb.games) {
    for (const section of game.sections) {
      const score = cosineSimilarity(queryVector, section.tfidf_vector);
      if (score >= minScore) {
        results.push({ score, section, jeu: game.jeu, jeu_id: game.id });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topN);
}
