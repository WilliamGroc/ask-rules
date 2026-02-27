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
import { STOPWORDS_FR, GAME_NOUNS } from '../utils/frenchWords';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    isValidFormat: boolean;
    fileFormat: string;
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
 * Retourne le ratio de mots français courants trouvés dans le texte.
 */
function calculateFrenchScore(text: string): number {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return 0;

  const frenchCount = countKeywords(text, [...STOPWORDS_FR]);

  // Score basé sur le ratio de mots français par rapport au nombre total de mots
  // On normalise par tranches de 10 mots pour obtenir un score exploitable
  return frenchCount / Math.max(words.length / 10, 1);
}

/**
 * Calcule un score de jeu de société basé sur les mots-clés.
 */
function calculateBoardGameScore(text: string): number {
  return countKeywords(text, [...GAME_NOUNS]);
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
    acceptedFormats?: string[]; // Formats acceptés (défaut: ['.pdf', '.txt'])
    minFrenchScore?: number; // Score minimum de français (défaut: 3)
    minBoardGameScore?: number; // Nombre minimum de mots-clés jeux (défaut: 3)
    sampleSize?: number; // Nombre de caractères à analyser (défaut: 2000)
  } = {}
): Promise<ValidationResult> {
  const {
    acceptedFormats = ['.pdf', '.txt'],
    minFrenchScore = 3,
    minBoardGameScore = 3,
    sampleSize = 2000,
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Vérification du format
  const ext = path.extname(filePath).toLowerCase();
  const isValidFormat = acceptedFormats.includes(ext);

  if (!isValidFormat) {
    const formatsStr = acceptedFormats.join(', ');
    errors.push(`Le fichier doit être dans un des formats acceptés : ${formatsStr} (reçu: ${ext}).`);
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
          isValidFormat,
          fileFormat: ext,
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
        isValidFormat,
        fileFormat: ext,
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
      isValidFormat,
      fileFormat: ext,
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
