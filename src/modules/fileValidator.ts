/**
 * fileValidator.ts
 * Validation des fichiers lors de l'importation.
 *
 * Vérifie que :
 *   - Le fichier est au format PDF
 *   - Le contenu est en français
 *   - Le sujet concerne les jeux de société
 */

import path from 'node:path';
import { extractText } from './textExtractor';

// ── Configuration ──────────────────────────────────────────────────────────────

// Mots-clés obligatoires pour détecter un jeu de société (présence d'au moins 3)
const BOARD_GAME_KEYWORDS = [
  'jeu',
  'joueur',
  'joueurs',
  'plateau',
  'carte',
  'cartes',
  'pion',
  'pions',
  'tour',
  'tours',
  'partie',
  'règle',
  'règles',
  'victoire',
  'gagner',
  'perdre',
  'action',
  'actions',
  'phase',
  'phases',
  'ressource',
  'ressources',
  'point',
  'points',
  'dé',
  'dés',
  'jeton',
  'jetons',
  'tuile',
  'tuiles',
  'mise en place',
  'préparation',
  'matériel',
  'composants',
  'défausser',
  'piocher',
  'mélanger',
  'distribuer',
];

// Mots français courants pour détection de langue
const FRENCH_WORDS = [
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'et',
  'ou',
  'mais',
  'donc',
  'car',
  'pour',
  'dans',
  'sur',
  'avec',
  'sans',
  'pas',
  'plus',
  'très',
  'aussi',
  'vous',
  'nous',
  'ils',
  'elles',
  'qui',
  'que',
  'quoi',
  'où',
  'quand',
  'comment',
  'pourquoi',
  'chaque',
  'tout',
  'tous',
  'cette',
  'ces',
  'sont',
  'être',
  'avoir',
  'faire',
  'peut',
  'doit',
  'peut-être',
];

// Mots anglais courants (pour détection inverse)
const ENGLISH_WORDS = [
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'with',
  'can',
  'has',
  'was',
  'this',
  'that',
  'from',
  'they',
  'have',
  'will',
  'your',
  'what',
  'when',
  'there',
  'each',
  'which',
  'their',
  'said',
  'make',
  'like',
  'time',
  'player',
  'players',
  'game',
  'board',
  'card',
  'cards',
  'dice',
  'turn',
  'round',
  'victory',
];

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    isPdf: boolean;
    isFrench: boolean;
    isBoardGame: boolean;
    frenchScore: number;
    boardGameScore: number;
    sampleText?: string;
  };
}

// ── Fonctions utilitaires ──────────────────────────────────────────────────────

/**
 * Normalise un texte pour l'analyse : minuscules, sans accents.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Compte les occurrences de mots-clés dans un texte.
 */
function countKeywords(text: string, keywords: string[]): number {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/);
  const wordSet = new Set(words);

  let count = 0;
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (wordSet.has(normalizedKeyword) || normalized.includes(normalizedKeyword)) {
      count++;
    }
  }
  return count;
}

/**
 * Calcule un score de français basé sur la fréquence de mots français.
 */
function calculateFrenchScore(text: string): number {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return 0;

  const frenchCount = countKeywords(text, FRENCH_WORDS);
  const englishCount = countKeywords(text, ENGLISH_WORDS);

  // Score basé sur le ratio de mots français vs anglais
  const frenchRatio = frenchCount / Math.max(words.length / 10, 1); // Normalisé par rapport à la taille
  const englishPenalty = englishCount / Math.max(words.length / 10, 1);

  return Math.max(0, frenchRatio - englishPenalty * 0.5);
}

/**
 * Calcule un score de jeu de société basé sur les mots-clés.
 */
function calculateBoardGameScore(text: string): number {
  return countKeywords(text, BOARD_GAME_KEYWORDS);
}

// ── Fonction principale ────────────────────────────────────────────────────────

/**
 * Valide un fichier selon les critères :
 * - Format PDF
 * - Langue française
 * - Sujet : jeux de société
 *
 * @param filePath - Chemin du fichier à valider
 * @param options - Options de validation
 * @returns Résultat de la validation avec détails
 */
export async function validateFile(
  filePath: string,
  options: {
    strictPdf?: boolean; // Si true, rejette les non-PDF (défaut: true)
    minFrenchScore?: number; // Score minimum de français (défaut: 3)
    minBoardGameScore?: number; // Nombre minimum de mots-clés jeux (défaut: 3)
    sampleSize?: number; // Nombre de caractères à analyser (défaut: 2000)
  } = {}
): Promise<ValidationResult> {
  const {
    strictPdf = true,
    minFrenchScore = 3,
    minBoardGameScore = 3,
    sampleSize = 2000,
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Vérification du format PDF
  const ext = path.extname(filePath).toLowerCase();
  const isPdf = ext === '.pdf';

  if (strictPdf && !isPdf) {
    errors.push('Le fichier doit être au format PDF.');
  } else if (!isPdf) {
    warnings.push(`Le fichier n'est pas un PDF (extension: ${ext}).`);
  }

  // 2. Extraction d'un échantillon de texte
  let sampleText = '';
  let fullText = '';

  try {
    const pages = await extractText(filePath);
    fullText = pages.map((p) => p.text).join('\n');
    sampleText = fullText.slice(0, sampleSize);

    if (fullText.length < 100) {
      errors.push('Le fichier ne contient pas assez de texte exploitable.');
      return {
        valid: false,
        errors,
        warnings,
        details: {
          isPdf,
          isFrench: false,
          isBoardGame: false,
          frenchScore: 0,
          boardGameScore: 0,
          sampleText: fullText,
        },
      };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Impossible d'extraire le texte : ${msg}`);
    return {
      valid: false,
      errors,
      warnings,
      details: {
        isPdf,
        isFrench: false,
        isBoardGame: false,
        frenchScore: 0,
        boardGameScore: 0,
      },
    };
  }

  // 3. Détection de la langue française
  const frenchScore = calculateFrenchScore(sampleText);
  const isFrench = frenchScore >= minFrenchScore;

  if (!isFrench) {
    errors.push(
      `Le fichier ne semble pas être en français (score: ${frenchScore.toFixed(1)}/${minFrenchScore}).`
    );
  }

  // 4. Détection du sujet "jeux de société"
  const boardGameScore = calculateBoardGameScore(fullText);
  const isBoardGame = boardGameScore >= minBoardGameScore;

  if (!isBoardGame) {
    errors.push(
      `Le fichier ne semble pas concerner les jeux de société (${boardGameScore} mot${boardGameScore > 1 ? 's' : ''}-clé${boardGameScore > 1 ? 's' : ''} trouvé${boardGameScore > 1 ? 's' : ''}, minimum ${minBoardGameScore}).`
    );
    warnings.push(
      'Mots-clés attendus : joueur, carte, pion, tour, règle, victoire, plateau, etc.'
    );
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    details: {
      isPdf,
      isFrench,
      isBoardGame,
      frenchScore: parseFloat(frenchScore.toFixed(1)),
      boardGameScore,
      sampleText: sampleText.slice(0, 200) + '...',
    },
  };
}

/**
 * Valide un fichier et lance une exception si invalide.
 * Utile pour un usage simple sans gestion détaillée des erreurs.
 */
export async function validateFileOrThrow(
  filePath: string,
  options?: Parameters<typeof validateFile>[1]
): Promise<void> {
  const result = await validateFile(filePath, options);

  if (!result.valid) {
    const errorMessage = [
      '❌ Fichier invalide :',
      ...result.errors,
      ...(result.warnings.length > 0 ? ['', 'Avertissements :', ...result.warnings] : []),
    ].join('\n  • ');

    throw new Error(errorMessage);
  }
}
