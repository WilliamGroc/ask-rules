/**
 * intentDetector.ts — Détection d'intention pour adapter la stratégie de recherche
 * 
 * Identifie le type de question posée pour optimiser la récupération du contexte :
 *   - overview : questions générales demandant un résumé ou une vue d'ensemble
 *   - specific : questions précises sur une règle ou mécanisme particulier
 * 
 * Pour les questions overview, on :
 *   - Récupère plus de sections (6-8 au lieu de 4)
 *   - Priorise les sections clés (presentation, but_du_jeu, tour_de_jeu, victoire)
 *   - Utilise les résumés extractifs plutôt que le contenu complet
 */

import type { GameSectionType } from '../types';

export type QuestionIntent = 'overview' | 'specific';

export interface IntentAnalysis {
  intent: QuestionIntent;
  confidence: number;
  /** Sections clés à prioriser pour cette question */
  prioritySections?: GameSectionType[];
  /** Nombre de sections recommandé */
  recommendedSections: number;
}

// ── Patterns de détection ─────────────────────────────────────────────────────

/** Mots-clés indiquant une demande de résumé/vue d'ensemble */
const OVERVIEW_PATTERNS = [
  /r[ée]sum[ée]/i,
  /\bvue\s+d'ensemble\b/i,
  /\bvue\s+g[ée]n[ée]rale\b/i,
  /\bcomment\s+(se\s+)?joue/i,
  /\bcomment\s+[çc]a\s+(se\s+)?joue/i,
  /\bexplique[-\s]?(moi|nous)/i,
  /\bc'est\s+quoi\b/i,
  /\bqu'?est[-\s]ce\s+(que\s+)?c'?est\b/i,
  /\bprincipe\s+(du\s+)?jeu/i,
  /\bfonctionne\s+le\s+jeu/i,
  /\bd[ée]roul(?:e|ement)/i,
  /\bgrand(?:e)?s?\s+lignes?\b/i,
  /\bbase\b/i,
  /\bpr[ée]sentation\b/i,
  /\bintroduction\b/i,
  /\bg[ée]n[ée]ral(?:e|ement)?\b/i,
  /\baper[çc]u\b/i,
  /\bcomment\s+gagne/i,
  /\bbut\s+du\s+jeu/i,
  /\bobj?ectif/i,
];

/** Mots-clés indiquant une question spécifique */
const SPECIFIC_INDICATORS = [
  /\bque\s+se\s+passe/i,
  /\bsi\s+je\b/i,
  /\bsi\s+on\b/i,
  /\bpuis[-\s]?je\b/i,
  /\bpeut[-\s]on\b/i,
  /\best[-\s]ce\s+que/i,
  /\bcombien\s+de\b/i,
  /\bquand\b/i,
  /\bo[ùu]\b/i,
  /\bpourquoi\b/i,
  /\bcomment\s+(?!joue)(?!se\s+joue)/i, // "comment" suivi d'autre chose que "joue"
];

// ── Fonction principale ───────────────────────────────────────────────────────

/**
 * Analyse une question pour déterminer son intention.
 * 
 * @param question - Question de l'utilisateur
 * @returns Analyse de l'intention avec recommandations
 */
export function detectIntent(question: string): IntentAnalysis {
  const normalized = question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Compte les correspondances
  let overviewScore = 0;
  let specificScore = 0;

  for (const pattern of OVERVIEW_PATTERNS) {
    if (pattern.test(normalized)) {
      overviewScore++;
    }
  }

  for (const pattern of SPECIFIC_INDICATORS) {
    if (pattern.test(normalized)) {
      specificScore++;
    }
  }

  // Les questions courtes (< 8 mots) sans indicateurs spécifiques sont souvent des overview
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount < 8 && specificScore === 0 && overviewScore === 0) {
    overviewScore += 0.5;
  }

  // Détermination de l'intention
  const isOverview = overviewScore > specificScore;
  const confidence = Math.abs(overviewScore - specificScore) / Math.max(overviewScore + specificScore, 1);

  if (isOverview) {
    return {
      intent: 'overview',
      confidence,
      prioritySections: [
        'presentation',
        'but_du_jeu',
        'tour_de_jeu',
        'victoire',
        'preparation',
        'materiel',
      ] as GameSectionType[],
      recommendedSections: 8, // Plus de sections pour avoir une vue complète
    };
  }

  return {
    intent: 'specific',
    confidence,
    recommendedSections: 4, // Nombre standard pour questions spécifiques
  };
}

/**
 * Détermine si une question demande un résumé général du jeu.
 * Raccourci pour la détection d'intention avec seuil de confiance.
 */
export function isOverviewQuestion(question: string, minConfidence = 0.3): boolean {
  const analysis = detectIntent(question);
  return analysis.intent === 'overview' && analysis.confidence >= minConfidence;
}
