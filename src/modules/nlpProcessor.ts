/**
 * nlpProcessor.ts — Analyse NLP spécialisée pour le français et les jeux de société
 *
 * Utilise la librairie `natural` pour le français :
 *   - AggressiveTokenizerFr : tokenisation adaptée au français
 *   - PorterStemmerFr       : stemming (racines communes pour les variantes d'un mot)
 *
 * Complété par :
 *   - Un lexique de jeu de société (GAME_NOUNS)
 *   - La détection de verbes français (infinitifs + impératifs → infinitif lisible)
 *   - Un extracteur de mécaniques de jeu par correspondance de patterns
 *   - Un résumé extractif basé sur les phrases les plus denses
 */

import { AggressiveTokenizerFr, PorterStemmerFr } from 'natural';
import type { NlpResult, GameMechanic } from '../types';

const tokenizerFr = new AggressiveTokenizerFr();

// ── Stopwords français ────────────────────────────────────────────────────────

const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'et', 'ou',
  'mais', 'donc', 'or', 'ni', 'car', 'que', 'qui', 'qu', 'se', 'si', 'en',
  'y', 'il', 'elle', 'ils', 'elles', 'on', 'nous', 'vous', 'je', 'tu',
  'ce', 'cet', 'cette', 'ces', 'son', 'sa', 'ses', 'mon', 'ma', 'mes',
  'ton', 'ta', 'tes', 'leur', 'leurs', 'notre', 'votre', 'vos', 'nos',
  'à', 'au', 'aux', 'par', 'pour', 'sur', 'sous', 'dans', 'avec', 'sans',
  'est', 'sont', 'être', 'avoir', 'fait', 'font', 'peut', 'peuvent',
  'tout', 'tous', 'toutes', 'toute', 'chaque', 'chacun', 'chacune',
  'plus', 'moins', 'très', 'bien', 'aussi', 'alors', 'ainsi', 'dont',
  'lors', 'dès', 'après', 'avant', 'pendant', 'quand', 'lorsque',
  'même', 'autre', 'autres', 'entre', 'vers', 'soit', 'doit', 'doivent',
  'lors', 'celui', 'celle', 'ceux', 'celles', 'aucun', 'aucune',
  'selon', 'afin', 'comme', 'sinon', 'encore', 'voici', 'voilà',
  'pas', 'plus', 'non', 'oui', 'si', 'ne', 'n', 'c', 'j', 'y',
]);

// ── Lexique de jeu de société (entités) ──────────────────────────────────────

/**
 * Noms caractéristiques du domaine "jeu de société".
 * Détectés même s'ils n'apparaissent qu'une seule fois.
 */
const GAME_NOUNS = new Set([
  // Composants
  'plateau', 'carte', 'cartes', 'dé', 'dés', 'pion', 'pions',
  'jeton', 'jetons', 'tuile', 'tuiles', 'marqueur', 'marqueurs',
  'deck', 'pioche', 'défausse', 'main', 'rivière', 'sac',
  'ressource', 'ressources', 'cube', 'cubes', 'token',
  // Lieux de jeu
  'territoire', 'territoires', 'citadelle', 'bâtiment', 'bâtiments',
  'forteresse', 'marché', 'entrepôt', 'temple', 'tour',
  // Acteurs
  'joueur', 'joueurs', 'adversaire', 'allié', 'partenaire',
  'gardien', 'gardiens', 'ombre', 'ombres', 'créature',
  // Ressources spécifiques
  'bois', 'pierre', 'or', 'nourriture', 'magie',
  // Concepts de jeu
  'point', 'points', 'victoire', 'score', 'manche', 'tour', 'phase',
  'action', 'actions', 'combat', 'attaque', 'défense', 'alliance',
  'objectif', 'règle', 'effet', 'capacité', 'sort', 'événement',
  'production', 'réserve', 'coût', 'bonus', 'pénalité',
]);

// ── Détection de verbes français ─────────────────────────────────────────────

/**
 * Convertit un impératif 2e personne pluriel (-ez) en infinitif approximatif.
 * Exemples : "placez" → "placer", "choisissez" → "choisir", "prenez" → "prendre"
 */
function imperativeToInfinitive(word: string): string {
  const w = word.toLowerCase();
  if (!w.endsWith('ez') || w.length < 5) return w;

  const stem = w.slice(0, -2);

  // Verbes en -issez (finir, choisir…) → conserver comme -ir (choisir)
  if (stem.endsWith('iss')) return stem.slice(0, -3) + 'ir';
  // Verbes en -aissez (connaître…) → -aître
  if (stem.endsWith('aiss')) return stem.slice(0, -4) + 'aître';
  // Verbes type "prenez" → "prendre", "vendez" → "vendre"
  if (/[dt]$/.test(stem)) return stem + 're';
  // Cas général : stem + "er" (placer, jouer, avancer…)
  return stem + 'er';
}

/**
 * Détermine si un mot est (ou ressemble à) un infinitif français.
 */
function isInfinitive(word: string): boolean {
  if (word.length < 4) return false;
  return /(?:er|ir|oir|re)$/i.test(word);
}

/**
 * Extrait les verbes d'action depuis un texte en français.
 * Utilise AggressiveTokenizerFr puis normalise les impératifs en infinitifs lisibles.
 */
function extractFrenchActions(text: string): string[] {
  const tokens: string[] = tokenizerFr.tokenize(text.toLowerCase()) ?? [];
  const verbs = new Set<string>();

  for (const token of tokens) {
    if (token.length <= 3 || STOPWORDS_FR.has(token)) continue;

    // Impératif pluriel → infinitif lisible ("placez" → "placer")
    if (token.endsWith('ez') && token.length >= 5) {
      verbs.add(imperativeToInfinitive(token));
      continue;
    }

    // Infinitif direct ("placer", "jouer", "attaquer"…)
    if (isInfinitive(token)) {
      verbs.add(token);
    }
  }

  return [...verbs].sort();
}

// ── Extraction d'entités ──────────────────────────────────────────────────────

/**
 * Extrait les entités du texte :
 *   1. Noms du lexique jeu (GAME_NOUNS) — via PorterStemmerFr pour les variantes
 *   2. Mots capitalisés non-début-de-phrase (noms propres de jeu)
 *   3. Noms communs apparaissant ≥ 2 fois (concepts-clés)
 */
function extractFrenchEntities(text: string): string[] {
  const entities = new Set<string>();

  // 1. Scan du lexique de jeu (terme exact OU même stem)
  const lower = text.toLowerCase();
  for (const noun of GAME_NOUNS) {
    if (lower.includes(noun)) entities.add(noun);
  }

  // 2. Mots capitalisés en milieu de phrase (noms propres, noms de jeu)
  const properNounRegex = /(?<=[,;:.!?\s])([A-ZÀÂÉÈÊËÎÏÔÙÛÜ][a-zàâéèêëîïôùûü]{2,})/g;
  for (const match of text.matchAll(properNounRegex)) {
    const word = match[1].toLowerCase();
    if (!STOPWORDS_FR.has(word) && word.length > 3) {
      entities.add(word);
    }
  }

  // 3. Mots fréquents (≥ 2 occurrences) via AggressiveTokenizerFr
  const tokens: string[] = tokenizerFr.tokenize(lower) ?? [];
  const freq: Record<string, number> = {};
  for (const w of tokens) {
    if (w.length > 3 && !STOPWORDS_FR.has(w) && !isInfinitive(w)) {
      // Utilise le stem pour regrouper les variantes, retourne la forme originale
      const stem = PorterStemmerFr.stem(w);
      freq[stem] = (freq[stem] ?? 0) + 1;
      if ((freq[stem] ?? 0) >= 2) entities.add(w);
    }
  }

  return [...entities].sort();
}

// ── Détection de mécaniques de jeu ───────────────────────────────────────────

/** Patterns textuels → mécaniques de jeu de société */
const MECHANIC_PATTERNS: Array<{ pattern: RegExp; mechanic: GameMechanic }> = [
  { pattern: /pla[cç]er?|pos(?:er|itionner)|déposer/i,         mechanic: 'placement' },
  { pattern: /pioch(?:er|ez)|tirer? (?:une? card|du deck)/i,    mechanic: 'pioche' },
  { pattern: /ressource|collect(?:er|ez)|produi(?:t|re|sez)/i,  mechanic: 'gestion_ressources' },
  { pattern: /d[eé]s? de combat|lanc(?:er|ez) (?:le|un) d[eé]|face [ée]p[eé]e/i, mechanic: 'combat_des' },
  { pattern: /terr?itoire|contrôl(?:er|ez)|occup(?:er|ez)/i,    mechanic: 'controle_territoire' },
  { pattern: /commerc(?:er|ez)|[eé]chang(?:er|ez)|march[eé]/i,  mechanic: 'commerce' },
  { pattern: /rivi[eè]re|draft|choisir (?:une?|parmi)/i,         mechanic: 'draft_cartes' },
  { pattern: /point[s]? de victoire|score|vp\b/i,               mechanic: 'points_victoire' },
  { pattern: /coop[eé]r|ensemble|alliés? gagnent|mode coop/i,   mechanic: 'cooperation' },
  { pattern: /carte [eé]v[eé]nement|[eé]v[eé]nement|catastroph/i, mechanic: 'events' },
];

/**
 * Détecte les mécaniques de jeu présentes dans un bloc de texte.
 */
export function detectMechanics(text: string): GameMechanic[] {
  const found = new Set<GameMechanic>();
  for (const { pattern, mechanic } of MECHANIC_PATTERNS) {
    if (pattern.test(text)) found.add(mechanic);
  }
  return [...found];
}

// ── Résumé extractif ──────────────────────────────────────────────────────────

/**
 * Retourne les 2 premières phrases françaises contenant ≥ 8 mots.
 */
function extractSummary(text: string, maxSentences = 2): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.split(/\s+/).length >= 8);
  return sentences.slice(0, maxSentences).join(' ');
}

// ── Export principal ──────────────────────────────────────────────────────────

/**
 * Analyse NLP complète d'une section de règles en français.
 */
export function analyzeText(text: string): NlpResult {
  if (!text || text.trim().length === 0) {
    return { entites: [], actions: [], resume: '' };
  }

  return {
    entites: extractFrenchEntities(text),
    actions: extractFrenchActions(text),
    resume:  extractSummary(text),
  };
}
