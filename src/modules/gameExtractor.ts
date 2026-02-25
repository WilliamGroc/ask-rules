/**
 * gameExtractor.ts
 * Extrait les métadonnées d'un document de règles de jeu de société.
 *
 * Détecte par pattern matching dans le texte complet :
 *   - Nombre de joueurs  : "2 à 5 joueurs", "pour 3-6 joueurs"
 *   - Âge minimum        : "à partir de 10 ans", "dès 8 ans"
 *   - Durée de partie    : "45 minutes", "1h à 2h", "30-90 min"
 *   - Nom du jeu         : première ligne non vide significative
 */

import type { GameMetadata } from '../types';

// ── Helpers internes ──────────────────────────────────────────────────────────

/** Extrait le premier groupe capturant d'un match, ou null. */
function firstMatch(text: string, pattern: RegExp): RegExpMatchArray | null {
  return text.match(pattern);
}

// ── Extraction joueurs ────────────────────────────────────────────────────────

/**
 * Détecte le nombre de joueurs min/max dans le texte.
 * Formes reconnues :
 *   "2 à 5 joueurs"  "pour 3-6 joueurs"  "2 à 4 participants"
 *   "pour 2 joueurs" (joueurs min = max = 2)
 */
export function extractPlayerCount(text: string): {
  min: number | null;
  max: number | null;
} {
  // Plage : "2 à 5 joueurs" ou "3-6 joueurs"
  const rangeMatch = firstMatch(
    text,
    /(\d+)\s*(?:à|au?|[-–])\s*(\d+)\s*(?:joueurs?|participants?|personnes?)/i,
  );
  if (rangeMatch) {
    return {
      min: parseInt(rangeMatch[1], 10),
      max: parseInt(rangeMatch[2], 10),
    };
  }

  // Valeur unique : "pour 2 joueurs"
  const singleMatch = firstMatch(
    text,
    /(?:pour|de|avec)\s+(\d+)\s+(?:joueurs?|participants?|personnes?)/i,
  );
  if (singleMatch) {
    const n = parseInt(singleMatch[1], 10);
    return { min: n, max: n };
  }

  return { min: null, max: null };
}

// ── Extraction âge ────────────────────────────────────────────────────────────

/**
 * Détecte l'âge minimum recommandé.
 * Formes reconnues :
 *   "à partir de 10 ans"  "dès 8 ans"  "10 ans et plus"  "age : 12+"
 */
export function extractMinAge(text: string): number | null {
  const patterns = [
    /(?:à partir de|dès|age\s*:?\s*|pour les?|convient dès)\s*(\d+)\s*ans/i,
    /(\d+)\s*ans\s+(?:et plus|minimum|et\+|\/\+)/i,
    /(\d+)\s*\+\s*ans/i,
  ];

  for (const pattern of patterns) {
    const match = firstMatch(text, pattern);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}

// ── Extraction durée ──────────────────────────────────────────────────────────

/**
 * Détecte la durée de partie en minutes.
 * Formes reconnues :
 *   "45 minutes"  "1h à 2h"  "30 à 90 min"  "durée : 1h30"
 */
export function extractDuration(text: string): {
  min: number | null;
  max: number | null;
} {
  // "30 à 90 minutes" ou "30-90 min"
  const minRangeMatch = firstMatch(
    text,
    /(\d+)\s*(?:à|[-–])\s*(\d+)\s*min(?:utes?)?/i,
  );
  if (minRangeMatch) {
    return {
      min: parseInt(minRangeMatch[1], 10),
      max: parseInt(minRangeMatch[2], 10),
    };
  }

  // "1h à 2h"
  const hourRangeMatch = firstMatch(text, /(\d+)h\s*(?:à|[-–])\s*(\d+)h/i);
  if (hourRangeMatch) {
    return {
      min: parseInt(hourRangeMatch[1], 10) * 60,
      max: parseInt(hourRangeMatch[2], 10) * 60,
    };
  }

  // "45 minutes" (valeur unique)
  const singleMinMatch = firstMatch(text, /(\d+)\s*min(?:utes?)?/i);
  if (singleMinMatch) {
    const n = parseInt(singleMinMatch[1], 10);
    return { min: n, max: n };
  }

  // "1h30" ou "2h"
  const hourMatch = firstMatch(text, /(\d+)h(?:(\d+))?/i);
  if (hourMatch) {
    const n =
      parseInt(hourMatch[1], 10) * 60 +
      (hourMatch[2] ? parseInt(hourMatch[2], 10) : 0);
    return { min: n, max: n };
  }

  return { min: null, max: null };
}

// ── Extraction du nom du jeu ──────────────────────────────────────────────────

/**
 * Identifie le nom du jeu : première ligne non vide du document.
 * Ignore les lignes purement techniques (URL, version, etc.).
 */
export function extractGameName(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    // Ignore les lignes trop courtes, purement numériques ou avec des URLs
    if (
      line.length >= 3 &&
      !/^[\d.]+$/.test(line) &&
      !/https?:\/\//.test(line)
    ) {
      return line;
    }
  }
  return 'Jeu inconnu';
}

// ── Export principal ──────────────────────────────────────────────────────────

/**
 * Extrait toutes les métadonnées d'un document de règles.
 * Analyse le texte complet (pas seulement l'en-tête).
 */
export function extractGameMetadata(text: string): GameMetadata {
  const players = extractPlayerCount(text);
  const duration = extractDuration(text);

  return {
    joueurs_min: players.min,
    joueurs_max: players.max,
    age_minimum: extractMinAge(text),
    duree_minutes_min: duration.min,
    duree_minutes_max: duration.max,
  };
}
